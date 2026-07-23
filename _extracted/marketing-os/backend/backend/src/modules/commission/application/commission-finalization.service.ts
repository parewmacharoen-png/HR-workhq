// ============================================================================
// modules/commission/application/commission-finalization.service.ts
// Unified commission lifecycle: draft → approved → finalized → locked → payroll
// Future corrections: Commission Adjustment Workflow (architecture only).
// ============================================================================

import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import {
  COMMISSION_FINALIZATION_REPOSITORY,
  CommissionCycleRow,
  CommissionFinalizationRepository,
  CommissionCycleType,
} from '../domain/repositories/commission-finalization.repository';
import { MARKETING_COMMISSION_REPOSITORY, MarketingCommissionRepository } from '../domain/repositories/marketing-commission.repository';
import { ADMIN_COMMISSION_REPOSITORY, AdminCommissionRepository } from '../domain/repositories/admin-commission.repository';
import {
  CommissionCycleInvalidTransitionError,
  CommissionCycleLockedError,
  CommissionCycleNotFoundError,
  CommissionCycleSourceNotFoundError,
} from '../domain/errors/commission-finalization.errors';
import {
  CommissionCyclePreviewResponse,
  CommissionCycleResponse,
  toCommissionCycleAuditResponse,
  toCommissionCycleResponse,
} from './dto/commission-finalization.dto';
import { MarketingCommissionService } from './marketing-commission.service';
import { AdminCommissionService } from './admin-commission.service';
import { MarketingCycleLockService } from '../../marketing/application/marketing-cycle-lock.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { PayrollCycleResolverService } from '../../../shared/payroll/payroll-cycle-resolver.service';

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

@Injectable()
export class CommissionFinalizationService {
  constructor(
    @Inject(COMMISSION_FINALIZATION_REPOSITORY)
    private readonly repo: CommissionFinalizationRepository,
    @Inject(MARKETING_COMMISSION_REPOSITORY)
    private readonly marketingRepo: MarketingCommissionRepository,
    @Inject(ADMIN_COMMISSION_REPOSITORY)
    private readonly adminRepo: AdminCommissionRepository,
    @Inject(forwardRef(() => MarketingCommissionService))
    private readonly marketingCommission: MarketingCommissionService,
    @Inject(forwardRef(() => AdminCommissionService))
    private readonly adminCommission: AdminCommissionService,
    private readonly marketingCycleLock: MarketingCycleLockService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly prisma: PrismaService,
    private readonly cycleResolver: PayrollCycleResolverService,
  ) {}

  async listCycles(
    actor: ActorContext,
    filters: { companyId: string; earnCycleId?: string; type?: CommissionCycleType; status?: CommissionCycleRow['status'] },
  ): Promise<CommissionCycleResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, filters.companyId);
    const rows = await this.repo.list(filters);
    return rows.map(toCommissionCycleResponse);
  }

  async getCycle(actor: ActorContext, id: string): Promise<CommissionCycleResponse & { audits: ReturnType<typeof toCommissionCycleAuditResponse>[] }> {
    const cycle = await this.requireCycle(actor, id);
    const audits = await this.repo.listAudits(id);
    return {
      ...toCommissionCycleResponse(cycle),
      audits: audits.map(toCommissionCycleAuditResponse),
    };
  }

  async getCycleStatus(actor: ActorContext, id: string): Promise<{ id: string; status: CommissionCycleRow['status']; type: CommissionCycleType }> {
    const cycle = await this.requireCycle(actor, id);
    return { id: cycle.id, status: cycle.status, type: cycle.type };
  }

  async previewCycle(actor: ActorContext, id: string): Promise<CommissionCyclePreviewResponse> {
    const cycle = await this.requireCycle(actor, id);
    const preview = await this.buildPreview(cycle);
    return { cycle: toCommissionCycleResponse(cycle), ...preview };
  }

  async approveCycle(actor: ActorContext, id: string): Promise<CommissionCycleResponse> {
    const cycle = await this.requireCycle(actor, id);
    if (cycle.status === 'approved' || cycle.status === 'finalized' || cycle.status === 'locked') {
      return toCommissionCycleResponse(cycle);
    }
    if (cycle.status !== 'draft') {
      throw new CommissionCycleInvalidTransitionError(cycle.status, 'approve');
    }

    const preview = await this.buildPreview(cycle);
    const updated = await this.repo.updateStatus(id, {
      status: 'approved',
      actorUserId: actor.userId,
      approvedBy: actor.userId,
      approvedAt: new Date(),
      totalCommission: preview.totals.totalCommission,
      totalRecipients: preview.totals.totalRecipients,
    });
    await this.repo.createAudit({
      commissionCycleId: id,
      action: 'approve',
      userId: actor.userId,
      beforeStatus: cycle.status,
      afterStatus: 'approved',
    });
    await this.audit.record(actor, {
      entityType: 'CommissionCycle',
      entityId: id,
      action: 'approve',
      after: { status: 'approved' },
    });
    return toCommissionCycleResponse(updated);
  }

  async finalizeCycle(
    actor: ActorContext,
    id: string,
  ): Promise<{ cycle: CommissionCycleResponse; payrollItemsCreated: number }> {
    const cycle = await this.requireCycle(actor, id);
    if (cycle.status === 'finalized' || cycle.status === 'locked') {
      return { cycle: toCommissionCycleResponse(cycle), payrollItemsCreated: 0 };
    }
    if (cycle.status !== 'approved') {
      throw new CommissionCycleInvalidTransitionError(cycle.status, 'finalize');
    }

    let payrollItemsCreated = 0;
    switch (cycle.type) {
      case 'marketing': {
        const result = await this.marketingCommission.finalize(actor, cycle.sourceCycleId);
        payrollItemsCreated = result.payrollItemsCreated;
        break;
      }
      case 'admin': {
        const result = await this.adminCommission.finalize(actor, cycle.sourceCycleId);
        payrollItemsCreated = result.payrollItemsCreated;
        break;
      }
      case 'recruitment':
        payrollItemsCreated = await this.finalizeRecruitment(actor, cycle);
        break;
      case 'referral':
        payrollItemsCreated = await this.finalizeReferral(actor, cycle);
        break;
      default:
        throw new CommissionCycleSourceNotFoundError(cycle.type, cycle.sourceCycleId);
    }

    const preview = await this.buildPreview(cycle);
    const updated = await this.repo.updateStatus(id, {
      status: 'finalized',
      actorUserId: actor.userId,
      finalizedBy: actor.userId,
      finalizedAt: new Date(),
      totalCommission: preview.totals.totalCommission,
      totalRecipients: preview.totals.totalRecipients,
    });
    await this.repo.createAudit({
      commissionCycleId: id,
      action: 'finalize',
      userId: actor.userId,
      beforeStatus: cycle.status,
      afterStatus: 'finalized',
      metadata: { payrollItemsCreated },
    });
    await this.audit.record(actor, {
      entityType: 'CommissionCycle',
      entityId: id,
      action: 'finalize',
      after: { status: 'finalized', payrollItemsCreated },
    });
    return { cycle: toCommissionCycleResponse(updated), payrollItemsCreated };
  }

  async lockCycle(actor: ActorContext, id: string): Promise<CommissionCycleResponse> {
    const cycle = await this.requireCycle(actor, id);
    if (cycle.status === 'locked') {
      return toCommissionCycleResponse(cycle);
    }
    if (cycle.status !== 'finalized') {
      throw new CommissionCycleInvalidTransitionError(cycle.status, 'lock');
    }

    if (cycle.type === 'marketing') {
      await this.marketingCycleLock.lockCycle(
        actor,
        cycle.earnCycleId,
        `Commission cycle ${id} locked`,
        cycle.companyId,
      );
    }

    const updated = await this.repo.updateStatus(id, {
      status: 'locked',
      actorUserId: actor.userId,
      lockedBy: actor.userId,
      lockedAt: new Date(),
    });
    await this.repo.createAudit({
      commissionCycleId: id,
      action: 'lock',
      userId: actor.userId,
      beforeStatus: cycle.status,
      afterStatus: 'locked',
    });
    await this.audit.record(actor, {
      entityType: 'CommissionCycle',
      entityId: id,
      action: 'lock',
      after: { status: 'locked' },
    });
    return toCommissionCycleResponse(updated);
  }

  async syncFromMarketingCalculate(input: {
    sourceCycleId: string;
    companyId: string;
    earnCycleId: string;
    teamId: string;
    totalCommission: number;
    totalRecipients: number;
    actorUserId: string;
  }): Promise<CommissionCycleRow> {
    return this.repo.upsertFromCalculation({
      companyId: input.companyId,
      earnCycleId: input.earnCycleId,
      type: 'marketing',
      teamId: input.teamId,
      sourceCycleId: input.sourceCycleId,
      totalCommission: input.totalCommission,
      totalRecipients: input.totalRecipients,
      status: 'draft',
      actorUserId: input.actorUserId,
    });
  }

  async syncFromAdminCalculate(input: {
    sourceCycleId: string;
    companyId: string;
    earnCycleId: string;
    totalCommission: number;
    totalRecipients: number;
    actorUserId: string;
  }): Promise<CommissionCycleRow> {
    return this.repo.upsertFromCalculation({
      companyId: input.companyId,
      earnCycleId: input.earnCycleId,
      type: 'admin',
      sourceCycleId: input.sourceCycleId,
      totalCommission: input.totalCommission,
      totalRecipients: input.totalRecipients,
      status: 'draft',
      actorUserId: input.actorUserId,
    });
  }

  async ensureBatchCycle(
    actor: ActorContext,
    input: { companyId: string; earnCycleId: string; type: 'referral' | 'recruitment' },
  ): Promise<CommissionCycleRow> {
    await this.companyAccess.assertCompanyAccess(actor, input.companyId);
    const preview = input.type === 'recruitment'
      ? await this.previewRecruitmentBatch(input.companyId, input.earnCycleId)
      : await this.previewReferralBatch(input.companyId, input.earnCycleId);

    return this.repo.upsertFromCalculation({
      companyId: input.companyId,
      earnCycleId: input.earnCycleId,
      type: input.type,
      sourceCycleId: input.earnCycleId,
      totalCommission: preview.totals.totalCommission,
      totalRecipients: preview.totals.totalRecipients,
      status: 'draft',
      actorUserId: actor.userId,
    });
  }

  async assertUnlockedForEarnCycle(companyId: string, earnCycleId: string): Promise<void> {
    if (await this.repo.isEarnCycleLocked(companyId, earnCycleId)) {
      throw new CommissionCycleLockedError(earnCycleId);
    }
  }

  async assertUnlockedForMarketingTeam(
    companyId: string,
    earnCycleId: string,
    teamId: string,
  ): Promise<void> {
    await this.assertUnlockedForEarnCycle(companyId, earnCycleId);
    if (await this.repo.isMarketingTeamCycleLocked(companyId, earnCycleId, teamId)) {
      throw new CommissionCycleLockedError(earnCycleId);
    }
  }

  private async requireCycle(actor: ActorContext, id: string): Promise<CommissionCycleRow> {
    const cycle = await this.repo.findById(id);
    if (!cycle) throw new CommissionCycleNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, cycle.companyId);
    return cycle;
  }

  private async buildPreview(cycle: CommissionCycleRow): Promise<Omit<CommissionCyclePreviewResponse, 'cycle'>> {
    switch (cycle.type) {
      case 'marketing':
        return this.previewMarketing(cycle.sourceCycleId);
      case 'admin':
        return this.previewAdmin(cycle.sourceCycleId);
      case 'recruitment':
        return this.previewRecruitmentBatch(cycle.companyId, cycle.earnCycleId);
      case 'referral':
        return this.previewReferralBatch(cycle.companyId, cycle.earnCycleId);
      default:
        throw new CommissionCycleSourceNotFoundError(cycle.type, cycle.sourceCycleId);
    }
  }

  private async previewMarketing(sourceCycleId: string): Promise<Omit<CommissionCyclePreviewResponse, 'cycle'>> {
    const mktCycle = await this.marketingRepo.findCycleById(sourceCycleId);
    if (!mktCycle) throw new CommissionCycleSourceNotFoundError('marketing', sourceCycleId);

    const members = await this.prisma.marketingCommissionMemberResult.findMany({
      where: { cycleId: sourceCycleId },
      select: {
        employeeId: true,
        finalPayout: true,
        carryForwardIn: true,
        carryForwardOut: true,
        status: true,
      },
    });
    const carryForwards = await this.prisma.marketingCommissionCarryForward.findMany({
      where: { sourceCycleId, deletedAt: null },
      select: { employeeId: true, amount: true, status: true },
    });

    const recipients = members
      .filter((m) => Number(m.finalPayout) > 0 || Number(m.carryForwardOut) > 0)
      .map((m) => ({
        employeeId: m.employeeId,
        amount: Number(m.finalPayout),
        carryForwardIn: Number(m.carryForwardIn),
        carryForwardOut: Number(m.carryForwardOut),
        status: m.status,
      }));

    const totalCommission = members.reduce((s, m) => s + Number(m.finalPayout), 0)
      + Number(mktCycle.bigLeaderCommission ?? 0);
    const carryForward = carryForwards
      .filter((c) => c.status === 'pending')
      .reduce((s, c) => s + Number(c.amount), 0);
    const recovery = members.reduce((s, m) => s + Number(m.carryForwardIn), 0);

    return {
      totals: {
        totalCommission,
        totalRecipients: recipients.length + (Number(mktCycle.bigLeaderCommission) > 0 ? 1 : 0),
        carryForward,
        recovery,
        bigLeaderCommission: Number(mktCycle.bigLeaderCommission ?? 0),
      },
      recipients,
      carryForwards: carryForwards.map((c) => ({
        employeeId: c.employeeId,
        amount: Number(c.amount),
        status: c.status,
      })),
    };
  }

  private async previewAdmin(sourceCycleId: string): Promise<Omit<CommissionCyclePreviewResponse, 'cycle'>> {
    const adminCycle = await this.adminRepo.findCycleById(sourceCycleId);
    if (!adminCycle) throw new CommissionCycleSourceNotFoundError('admin', sourceCycleId);

    const members = await this.adminRepo.listMemberResults(sourceCycleId);
    const recipients = members
      .filter((m) => m.finalPayout > 0)
      .map((m) => ({
        employeeId: m.employeeId,
        amount: m.finalPayout,
        status: m.status,
      }));

    return {
      totals: {
        totalCommission: adminCycle.totalPayable,
        totalRecipients: recipients.length,
        carryForward: 0,
        recovery: 0,
        bigLeaderCommission: 0,
      },
      recipients,
      carryForwards: [],
    };
  }

  private async previewRecruitmentBatch(
    companyId: string,
    earnCycleId: string,
  ): Promise<Omit<CommissionCyclePreviewResponse, 'cycle'>> {
    const records = await this.prisma.commissionRecord.findMany({
      where: {
        companyId,
        earnCycleId,
        status: 'accrued',
        qualified: true,
        deletedAt: null,
      },
      select: { employeeId: true, grossAmount: true },
    });

    const recipients = records.map((r) => ({
      employeeId: r.employeeId,
      amount: Number(r.grossAmount),
      status: 'accrued',
    }));

    return {
      totals: {
        totalCommission: recipients.reduce((s, r) => s + r.amount, 0),
        totalRecipients: recipients.length,
        carryForward: 0,
        recovery: 0,
        bigLeaderCommission: 0,
      },
      recipients,
      carryForwards: [],
    };
  }

  private async previewReferralBatch(
    companyId: string,
    earnCycleId: string,
  ): Promise<Omit<CommissionCyclePreviewResponse, 'cycle'>> {
    const earnCycle = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, companyId, deletedAt: null },
    });
    if (!earnCycle) {
      return {
        totals: { totalCommission: 0, totalRecipients: 0, carryForward: 0, recovery: 0, bigLeaderCommission: 0 },
        recipients: [],
        carryForwards: [],
      };
    }

    const referrals = await this.prisma.referral.findMany({
      where: {
        companyId,
        status: 'qualified',
        deletedAt: null,
        qualifiedAt: {
          gte: earnCycle.periodStart,
          lte: earnCycle.periodEnd,
        },
      },
      select: { referrerEmployeeId: true, rewardAmount: true },
    });

    const recipients = referrals.map((r) => ({
      employeeId: r.referrerEmployeeId,
      amount: Number(r.rewardAmount),
      status: 'qualified',
    }));

    return {
      totals: {
        totalCommission: recipients.reduce((s, r) => s + r.amount, 0),
        totalRecipients: recipients.length,
        carryForward: 0,
        recovery: 0,
        bigLeaderCommission: 0,
      },
      recipients,
      carryForwards: [],
    };
  }

  private async finalizeRecruitment(actor: ActorContext, cycle: CommissionCycleRow): Promise<number> {
    const payCycleId = await this.adminRepo.resolvePayCycleId(cycle.companyId, cycle.earnCycleId);
    if (!payCycleId) {
      throw new CommissionCycleSourceNotFoundError('recruitment', cycle.earnCycleId);
    }

    const records = await this.prisma.commissionRecord.findMany({
      where: {
        companyId: cycle.companyId,
        earnCycleId: cycle.earnCycleId,
        status: 'accrued',
        qualified: true,
        deletedAt: null,
      },
    });

    let created = 0;
    for (const record of records) {
      const amount = Number(record.grossAmount);
      if (amount <= 0) continue;

      let payrollItemId = record.payrollItemId;
      if (!payrollItemId) {
        const existing = await this.prisma.payrollItem.findFirst({
          where: {
            sourceRefType: 'recruitment_commission',
            sourceRefId: record.id,
            deletedAt: null,
          },
        });
        payrollItemId = existing?.id ?? null;
      }

      if (!payrollItemId) {
        payrollItemId = randomUUID();
        await this.prisma.payrollItem.create({
          data: {
            id: payrollItemId,
            payrollCycleId: payCycleId,
            employeeId: record.employeeId,
            companyId: cycle.companyId,
            itemType: 'commission',
            amount: dec(amount),
            sourceRefType: 'recruitment_commission',
            sourceRefId: record.id,
            note: `Recruitment commission — cycle ${cycle.earnCycleId}`,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        created += 1;
      }

      await this.prisma.commissionRecord.update({
        where: { id: record.id },
        data: {
          status: 'paid',
          payCycleId,
          payrollItemId,
          updatedBy: actor.userId,
        },
      });
    }
    return created;
  }

  private async finalizeReferral(actor: ActorContext, cycle: CommissionCycleRow): Promise<number> {
    const earnCycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycle.earnCycleId, companyId: cycle.companyId, deletedAt: null },
    });
    if (!earnCycle) return 0;

    const payCycleId = await this.adminRepo.resolvePayCycleId(cycle.companyId, cycle.earnCycleId);
    if (!payCycleId) return 0;

    const referrals = await this.prisma.referral.findMany({
      where: {
        companyId: cycle.companyId,
        status: 'qualified',
        deletedAt: null,
        qualifiedAt: {
          gte: earnCycle.periodStart,
          lte: earnCycle.periodEnd,
        },
      },
    });

    let created = 0;
    for (const referral of referrals) {
      const amount = Number(referral.rewardAmount);
      if (amount <= 0) continue;

      let payrollItemId = referral.payrollItemId;
      if (!payrollItemId) {
        const existing = await this.prisma.payrollItem.findFirst({
          where: {
            sourceRefType: 'referral_commission',
            sourceRefId: referral.id,
            deletedAt: null,
          },
        });
        payrollItemId = existing?.id ?? null;
      }

      if (!payrollItemId) {
        payrollItemId = randomUUID();
        await this.prisma.payrollItem.create({
          data: {
            id: payrollItemId,
            payrollCycleId: payCycleId,
            employeeId: referral.referrerEmployeeId,
            companyId: cycle.companyId,
            itemType: 'commission',
            amount: dec(amount),
            sourceRefType: 'referral_commission',
            sourceRefId: referral.id,
            note: `Referral commission — cycle ${cycle.earnCycleId}`,
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
        created += 1;
      }

      await this.prisma.referral.update({
        where: { id: referral.id },
        data: {
          status: 'paid',
          payrollItemId,
          updatedBy: actor.userId,
        },
      });
    }
    return created;
  }
}
