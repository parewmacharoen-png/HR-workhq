// ============================================================================
// modules/commission/application/admin-commission.service.ts
// ============================================================================

import { Inject, Injectable, Optional } from '@nestjs/common';
import {
  ADMIN_COMMISSION_REPOSITORY,
  AdminCommissionRepository,
} from '../domain/repositories/admin-commission.repository';
import { AdminCommissionCalculationService, resolveLeavePenaltyRate } from '../domain/services/admin-commission-calculation.service';
import { FormulaResolverService } from '../../formula-engine/application/formula-resolver.service';
import {
  AdminCommissionCycleExistsError,
  AdminCommissionCycleNotFoundError,
  AdminCommissionNoMembersError,
  AdminPayCycleNotFoundError,
} from '../domain/errors/admin-commission.errors';
import {
  AdminCommissionCycleResponse,
  CalculateAdminCommissionDto,
} from './dto/admin-commission.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import type { CommissionFinalizationService } from './commission-finalization.service';
import { COMMISSION_FINALIZATION_SERVICE } from './commission-finalization.service.token';

@Injectable()
export class AdminCommissionService {
  private readonly calculator = new AdminCommissionCalculationService();

  constructor(
    @Inject(ADMIN_COMMISSION_REPOSITORY) private readonly repo: AdminCommissionRepository,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly prisma: PrismaService,
    @Inject(COMMISSION_FINALIZATION_SERVICE)
    private readonly finalization: CommissionFinalizationService,
    @Optional() private readonly formulaResolver?: FormulaResolverService,
  ) {}

  async calculate(
    actor: ActorContext,
    dto: CalculateAdminCommissionDto,
  ): Promise<AdminCommissionCycleResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    await this.finalization.assertUnlockedForEarnCycle(dto.companyId, dto.earnCycleId);

    const existing = await this.repo.findCycle(dto.companyId, dto.earnCycleId);
    if (existing) throw new AdminCommissionCycleExistsError();

    const context = await this.repo.loadCycleContext(dto.companyId, dto.earnCycleId);
    const members = await this.repo.loadMembers(dto.companyId, context);
    if (members.length === 0) throw new AdminCommissionNoMembersError();

    for (const m of members) {
      const override = dto.extraLeaveOverrides?.[m.employeeId];
      if (override != null) m.extraLeaveDays = override;
    }

    if (this.formulaResolver) {
      for (const m of members) {
        const resolved = await this.formulaResolver.resolveWithFallback(
          'commission.admin_leave_penalty',
          {
            companyId: dto.companyId,
            entityType: 'AdminCommissionMember',
            entityId: m.employeeId,
            inputs: {
              leaveDaysOverLimit: m.extraLeaveDays,
              totalLeaveDays: m.extraLeaveDays,
              eligibleCommission: 1,
              companyId: 0,
            },
            executedBy: actor.userId,
          },
          () => 1 - resolveLeavePenaltyRate(m.extraLeaveDays),
        );
        m.penaltyRateOverride = 1 - resolved.value;
      }
    }

    const calculation = this.calculator.calculate({
      netProfit: dto.netProfit,
      members,
    });

    const cycleId = await this.repo.persistCalculation(
      { context, netProfit: dto.netProfit, calculation },
      actor.userId,
    );

    await this.finalization.syncFromAdminCalculate({
      sourceCycleId: cycleId,
      companyId: dto.companyId,
      earnCycleId: dto.earnCycleId,
      totalCommission: calculation.totalPayable,
      totalRecipients: calculation.members.filter((m) => m.finalPayout > 0).length,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'AdminCommissionCycle',
      entityId: cycleId,
      action: 'calculate',
      after: {
        netProfit: calculation.netProfit,
        adminPool: calculation.adminPool,
        totalPayable: calculation.totalPayable,
      },
    });

    const employeeIds = calculation.members.map((m) => m.employeeId);
    const employees = employeeIds.length > 0
      ? await this.prisma.employee.findMany({
        where: { id: { in: employeeIds }, deletedAt: null },
        select: { id: true, globalId: true, firstName: true, lastName: true },
      })
      : [];
    const labelById = new Map(employees.map((e) => [
      e.id,
      `${e.globalId} · ${[e.firstName, e.lastName].filter(Boolean).join(' ')}`.trim(),
    ]));

    return {
      cycleId,
      netProfit: calculation.netProfit,
      adminPool: calculation.adminPool,
      poolA: calculation.poolA,
      poolB: calculation.poolB,
      totalPenalties: calculation.totalPenalties,
      totalRedistributed: calculation.totalRedistributed,
      totalPayable: calculation.totalPayable,
      frontOfficeTotal: calculation.frontOfficeTotal,
      backOfficeTotal: calculation.backOfficeTotal,
      memberCount: calculation.members.length,
      status: 'calculated',
      members: calculation.members.map((m) => ({
        employeeId: m.employeeId,
        employeeName: labelById.get(m.employeeId) ?? m.employeeId,
        globalId: employees.find((e) => e.id === m.employeeId)?.globalId,
        finalPayout: m.finalPayout,
        status: m.status,
        officeType: m.officeType,
        penaltyDeduction: m.penaltyDeduction,
        redistributionBonus: m.redistributionBonus,
      })),
    };
  }

  async finalize(actor: ActorContext, cycleId: string): Promise<{ cycleId: string; payrollItemsCreated: number }> {
    const cycle = await this.repo.findCycleById(cycleId);
    if (!cycle) throw new AdminCommissionCycleNotFoundError(cycleId);
    await this.companyAccess.assertCompanyAccess(actor, cycle.companyId);

    if (cycle.status === 'finalized') {
      return { cycleId, payrollItemsCreated: 0 };
    }

    const payCycleId = cycle.payCycleId ?? await this.repo.resolvePayCycleId(cycle.companyId, cycle.earnCycleId);
    if (!payCycleId) throw new AdminPayCycleNotFoundError();

    let payrollItemsCreated = 0;
    const members = await this.repo.listMemberResults(cycleId);

    for (const member of members) {
      if (member.status !== 'pending_pay' || member.finalPayout <= 0) continue;

      let payrollItemId = member.payrollItemId ?? await this.repo.findPayrollItemBySource(member.id);
      if (!payrollItemId) {
        payrollItemId = await this.repo.createPayrollItem({
          payCycleId,
          employeeId: member.employeeId,
          companyId: cycle.companyId,
          amount: member.finalPayout,
          sourceRefId: member.id,
          note: `Admin commission — cycle ${cycleId}`,
          actorUserId: actor.userId,
        });
        payrollItemsCreated += 1;
      }

      await this.repo.markMemberPaid(member.id, payrollItemId, actor.userId);
    }

    await this.repo.finalizeCycle(cycleId, actor.userId);

    await this.audit.record(actor, {
      entityType: 'AdminCommissionCycle',
      entityId: cycleId,
      action: 'finalize',
      after: { payCycleId, payrollItemsCreated },
    });

    return { cycleId, payrollItemsCreated };
  }
}
