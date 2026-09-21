// ============================================================================
// modules/commission/application/marketing-commission.service.ts
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  MARKETING_COMMISSION_REPOSITORY,
  MarketingCommissionRepository,
} from '../domain/repositories/marketing-commission.repository';
import { MarketingCommissionCalculationService } from '../domain/services/marketing-commission-calculation.service';
import {
  MarketingCommissionAlreadyFinalizedError,
  MarketingCommissionCycleExistsError,
  MarketingCommissionCycleNotFoundError,
  MarketingPayCycleNotFoundError,
} from '../domain/errors/marketing-commission.errors';
import {
  CalculateMarketingCommissionDto,
  MarketingCommissionCycleResponse,
} from './dto/marketing-commission.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { MarketingExpenseService } from '../../marketing/application/marketing-expense.service';
import { MarketingFinancialDto } from './dto/marketing-commission.dto';
import type { CommissionFinalizationService } from './commission-finalization.service';
import { COMMISSION_FINALIZATION_SERVICE } from './commission-finalization.service.token';
import { RuleConfigService } from '../../settings/application/rule-config.service';

@Injectable()
export class MarketingCommissionService {
  private readonly calculator = new MarketingCommissionCalculationService();

  constructor(
    @Inject(MARKETING_COMMISSION_REPOSITORY) private readonly repo: MarketingCommissionRepository,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly marketingExpenses: MarketingExpenseService,
    private readonly ruleConfig: RuleConfigService,
    @Inject(COMMISSION_FINALIZATION_SERVICE)
    private readonly finalization: CommissionFinalizationService,
  ) {}

  async calculate(
    actor: ActorContext,
    dto: CalculateMarketingCommissionDto,
  ): Promise<MarketingCommissionCycleResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    await this.finalization.assertUnlockedForMarketingTeam(dto.companyId, dto.earnCycleId, dto.teamId);

    const existing = await this.repo.findCycle(dto.companyId, dto.teamId, dto.earnCycleId);
    if (existing) throw new MarketingCommissionCycleExistsError();

    const context = await this.repo.loadTeamContext(dto.companyId, dto.teamId, dto.earnCycleId);
    const members = await this.repo.loadTeamMembers(
      dto.teamId,
      dto.companyId,
      dto.earnCycleId,
      context.bigLeaderEmployeeId,
    );

    for (const m of members) {
      const override = dto.rampOverrides?.[m.employeeId];
      if (override != null) m.rampOverridePercent = override;
    }

    const pendingCarries = await this.repo.loadPendingCarries(dto.teamId, dto.companyId);

    const financial = await this.resolveFinancial(dto.companyId, dto.teamId, dto.earnCycleId, dto.financial);
    const settings = await this.ruleConfig.getMarketingConfig(dto.companyId);
    const rampByTenureMonth: Record<number, number> = {
      1: settings.newHireRamp.month1 / 100,
      2: settings.newHireRamp.month2 / 100,
      3: settings.newHireRamp.month3 / 100,
      4: settings.newHireRamp.month4 / 100,
      5: settings.newHireRamp.month5 / 100,
    };

    const calculation = this.calculator.calculate({
      cyclePeriodEnd: context.cyclePeriodEnd,
      financial,
      members,
      pendingCarries: pendingCarries.map((c) => ({
        employeeId: c.employeeId,
        amount: c.amount,
        sourceCycleId: c.sourceCycleId,
      })),
      bigLeaderEmployeeId: context.bigLeaderEmployeeId,
      kpiTarget: settings.kpiTargetDefault,
      rates: {
        teamPoolRate: settings.teamPoolPercent / 100,
        bigLeaderRate: settings.bigLeaderPercent / 100,
        promotionGrossThreshold: settings.promotionExpenseThreshold,
        companyHeadDeductionRate: settings.companyHeadDeductionPercent / 100,
        rampByTenureMonth,
      },
    });

    const cycleId = await this.repo.persistCalculation(
      { context, financial, calculation },
      actor.userId,
    );

    const payableMembers = calculation.members.filter((m) => m.finalPayout > 0);
    await this.finalization.syncFromMarketingCalculate({
      sourceCycleId: cycleId,
      companyId: dto.companyId,
      earnCycleId: dto.earnCycleId,
      teamId: dto.teamId,
      totalCommission: calculation.members.reduce((s, m) => s + m.finalPayout, 0) + calculation.bigLeaderCommission,
      totalRecipients: payableMembers.length + (calculation.bigLeaderCommission > 0 ? 1 : 0),
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'MarketingCommissionCycle',
      entityId: cycleId,
      action: 'calculate',
      after: {
        netProfit: calculation.netProfit,
        teamCommissionPool: calculation.teamCommissionPool,
        bigLeaderCommission: calculation.bigLeaderCommission,
      },
    });

    return {
      cycleId,
      netProfit: calculation.netProfit,
      teamCommissionPool: calculation.teamCommissionPool,
      bigLeaderCommission: calculation.bigLeaderCommission,
      memberCount: calculation.memberCount,
      status: 'calculated',
      members: calculation.members.map((m) => ({
        employeeId: m.employeeId,
        finalPayout: m.finalPayout,
        status: m.status,
        kpiQualified: m.kpiQualified,
        rampPercent: m.rampPercent,
      })),
    };
  }

  async finalize(actor: ActorContext, cycleId: string): Promise<{ cycleId: string; payrollItemsCreated: number }> {
    const cycle = await this.repo.findCycleById(cycleId);
    if (!cycle) throw new MarketingCommissionCycleNotFoundError(cycleId);
    await this.companyAccess.assertCompanyAccess(actor, cycle.companyId);

    if (cycle.status === 'finalized') {
      return { cycleId, payrollItemsCreated: 0 };
    }

    const payCycleId = cycle.payCycleId ?? await this.repo.resolvePayCycleId(cycle.companyId, cycle.earnCycleId);
    if (!payCycleId) throw new MarketingPayCycleNotFoundError();

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
          note: `Marketing commission — cycle ${cycleId}`,
          actorUserId: actor.userId,
        });
        payrollItemsCreated += 1;
      }

      await this.repo.markMemberPaid(member.id, payrollItemId, actor.userId);
    }

    if (cycle.bigLeaderCommission > 0 && cycle.bigLeaderEmployeeId) {
      let blItemId = await this.repo.findPayrollItemBySource(cycleId);
      if (!blItemId) {
        blItemId = await this.repo.createPayrollItem({
          payCycleId,
          employeeId: cycle.bigLeaderEmployeeId,
          companyId: cycle.companyId,
          amount: cycle.bigLeaderCommission,
          sourceRefId: cycleId,
          note: `Marketing big-leader commission — cycle ${cycleId}`,
          actorUserId: actor.userId,
        });
        payrollItemsCreated += 1;
      }
      await this.repo.markBigLeaderPaid(cycleId, blItemId, actor.userId);
    }

    await this.repo.finalizeCycle(cycleId, actor.userId);

    await this.audit.record(actor, {
      entityType: 'MarketingCommissionCycle',
      entityId: cycleId,
      action: 'finalize',
      after: { payCycleId, payrollItemsCreated },
    });

    return { cycleId, payrollItemsCreated };
  }

  private async resolveFinancial(
    companyId: string,
    teamId: string,
    earnCycleId: string,
    input: MarketingFinancialDto,
  ) {
    const expenseTotals = await this.marketingExpenses.resolveCommissionExpenseTotals(
      companyId,
      teamId,
      earnCycleId,
    );

    return {
      grossProfit: input.grossProfit,
      employeeSalaryExpense: input.employeeSalaryExpense,
      marketingExpense: input.marketingExpense ?? expenseTotals.marketingExpense,
      lineExpense: input.lineExpense ?? expenseTotals.lineExpense,
      telesalesExpense: input.telesalesExpense ?? expenseTotals.telesalesExpense,
      promotionExpense: input.promotionExpense ?? expenseTotals.promotionExpense,
    };
  }
}
