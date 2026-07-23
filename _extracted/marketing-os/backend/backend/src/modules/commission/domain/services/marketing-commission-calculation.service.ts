// ============================================================================
// Marketing commission pure calculation (COM-MKT-001 … COM-MKT-012)
// ============================================================================

export const MARKETING_KPI_TARGET = 24;
export const MARKETING_TEAM_POOL_RATE = 0.10;
export const MARKETING_BIG_LEADER_RATE = 0.05;
export const MARKETING_COMPANY_HEAD_DEDUCTION_RATE = 0.40;
export const MARKETING_PROMOTION_GROSS_THRESHOLD = 500_000;

const RAMP_BY_TENURE_MONTH: Record<number, number> = {
  1: 0,
  2: 0.20,
  3: 0.20,
  4: 0.30,
  5: 0.40,
};

export interface MarketingFinancialInput {
  grossProfit: number;
  employeeSalaryExpense: number;
  marketingExpense: number;
  lineExpense: number;
  telesalesExpense: number;
  promotionExpense: number;
}

export interface MarketingMemberInput {
  employeeId: string;
  roleLevel: 'employee' | 'sub_leader' | 'big_leader';
  hireDate: Date;
  achievedCandidates: number;
  /** False for company big leader not enrolled on the team pool */
  includeInTeamPool: boolean;
  /** Big leader exempt from 24-candidate KPI (COM-MKT-007) */
  kpiExempt: boolean;
  /** Override ramp % (e.g. 50 = 50%) */
  rampOverridePercent?: number | null;
}

export interface PendingMarketingCarryForward {
  employeeId: string;
  amount: number;
  sourceCycleId: string;
}

export interface MarketingCommissionCalculationInput {
  cyclePeriodEnd: Date;
  financial: MarketingFinancialInput;
  members: MarketingMemberInput[];
  pendingCarries: PendingMarketingCarryForward[];
  bigLeaderEmployeeId: string | null;
  kpiTarget?: number;
  rates?: {
    teamPoolRate?: number;
    bigLeaderRate?: number;
    promotionGrossThreshold?: number;
    companyHeadDeductionRate?: number;
    rampByTenureMonth?: Record<number, number>;
  };
}

export interface NetProfitTrace {
  grossProfit: number;
  employeeSalaryExpense: number;
  marketingExpense: number;
  lineExpense: number;
  telesalesExpense: number;
  promotionExpenseApplied: number;
  promotionExpenseSkipped: boolean;
  profitAfterExpenses: number;
  companyHeadDeductionRate: number;
  companyHeadDeduction: number;
  netProfit: number;
}

export interface MarketingRedistributionLine {
  type: 'ramp_difference' | 'expired_carry';
  recipientEmployeeId: string;
  amount: number;
  sourceEmployeeId?: string;
}

export interface MarketingMemberCalculation {
  employeeId: string;
  roleLevel: string;
  tenureMonth: number;
  rampPercent: number;
  rampOverridePercent: number | null;
  achievedCandidates: number;
  targetCandidates: number;
  kpiQualified: boolean;
  kpiExempt: boolean;
  includeInTeamPool: boolean;
  memberCount: number;
  baseShare: number;
  rampedAmount: number;
  redistributionBonus: number;
  expiredCarryBonus: number;
  poolPayout: number;
  carryForwardIn: number;
  carryForwardOut: number;
  carryExpired: number;
  finalPayout: number;
  status: 'pending_pay' | 'carried_forward' | 'no_payout';
  trace: Record<string, unknown>;
}

export interface NewMarketingCarryForward {
  employeeId: string;
  amount: number;
}

export interface MarketingCommissionCalculationResult {
  trace: NetProfitTrace;
  netProfit: number;
  teamCommissionPool: number;
  leaderBase: number;
  bigLeaderEmployeeId: string | null;
  bigLeaderCommission: number;
  memberCount: number;
  baseShare: number;
  members: MarketingMemberCalculation[];
  redistributions: MarketingRedistributionLine[];
  newCarryForwards: NewMarketingCarryForward[];
  recoveredCarryEmployeeIds: string[];
  expiredCarryEmployeeIds: string[];
}

export class MarketingCommissionCalculationService {
  calculate(input: MarketingCommissionCalculationInput): MarketingCommissionCalculationResult {
    const kpiTarget = input.kpiTarget ?? MARKETING_KPI_TARGET;
    const teamPoolRate = input.rates?.teamPoolRate ?? MARKETING_TEAM_POOL_RATE;
    const bigLeaderRate = input.rates?.bigLeaderRate ?? MARKETING_BIG_LEADER_RATE;
    const trace = this.calculateNetProfit(
      input.financial,
      input.rates?.promotionGrossThreshold,
      input.rates?.companyHeadDeductionRate,
    );
    const netProfit = trace.netProfit;
    const teamCommissionPool = roundMoney(netProfit * teamPoolRate);
    const leaderBase = roundMoney(netProfit - teamCommissionPool);
    const bigLeaderCommission = input.bigLeaderEmployeeId
      ? roundMoney(leaderBase * bigLeaderRate)
      : 0;

    const poolMembers = input.members.filter((m) => m.includeInTeamPool);
    const memberCount = poolMembers.length;
    const baseShare = memberCount > 0 ? roundMoney(teamCommissionPool / memberCount) : 0;

    const pendingByEmployee = new Map(
      input.pendingCarries.map((c) => [c.employeeId, c.amount] as const),
    );

    const interim = poolMembers.map((member) => {
      const tenureMonth = this.tenureMonth(member.hireDate, input.cyclePeriodEnd);
      const rampPercent = this.resolveRampPercent(
        tenureMonth,
        member.rampOverridePercent,
        input.rates?.rampByTenureMonth,
      );
      const rampedAmount = roundMoney(baseShare * rampPercent);
      const kpiQualified = member.kpiExempt || member.achievedCandidates >= kpiTarget;
      return {
        member,
        tenureMonth,
        rampPercent,
        rampedAmount,
        kpiQualified,
        isFullyEligible: rampPercent >= 1,
      };
    });

    const totalRamped = roundMoney(interim.reduce((s, x) => s + x.rampedAmount, 0));
    const rampDifference = roundMoney(teamCommissionPool - totalRamped);
    const fullEligible = interim.filter((x) => x.isFullyEligible);
    const rampBonusPerFull = fullEligible.length > 0
      ? roundMoney(rampDifference / fullEligible.length)
      : 0;

    const redistributions: MarketingRedistributionLine[] = [];
    const withRampBonus = interim.map((row) => {
      const redistributionBonus = row.isFullyEligible ? rampBonusPerFull : 0;
      if (redistributionBonus > 0) {
        redistributions.push({
          type: 'ramp_difference',
          recipientEmployeeId: row.member.employeeId,
          amount: redistributionBonus,
        });
      }
      const poolPayout = roundMoney(row.rampedAmount + redistributionBonus);
      return { ...row, redistributionBonus, poolPayout };
    });

    let totalExpired = 0;
    const expiredByEmployee = new Map<string, number>();
    for (const row of withRampBonus) {
      const carryIn = pendingByEmployee.get(row.member.employeeId) ?? 0;
      if (row.isFullyEligible && !row.kpiQualified && carryIn > 0) {
        totalExpired = roundMoney(totalExpired + carryIn);
        expiredByEmployee.set(row.member.employeeId, carryIn);
      }
    }

    const expiredRecipients = withRampBonus.filter(
      (x) => x.isFullyEligible && x.kpiQualified,
    );
    const expiredBonusPerRecipient = expiredRecipients.length > 0 && totalExpired > 0
      ? roundMoney(totalExpired / expiredRecipients.length)
      : 0;

    for (const recipient of expiredRecipients) {
      if (expiredBonusPerRecipient > 0) {
        redistributions.push({
          type: 'expired_carry',
          recipientEmployeeId: recipient.member.employeeId,
          amount: expiredBonusPerRecipient,
        });
      }
    }

    const newCarryForwards: NewMarketingCarryForward[] = [];
    const recoveredCarryEmployeeIds: string[] = [];
    const expiredCarryEmployeeIds: string[] = [];

    const members: MarketingMemberCalculation[] = withRampBonus.map((row) => {
      const carryForwardIn = pendingByEmployee.get(row.member.employeeId) ?? 0;
      const expiredCarryBonus = row.isFullyEligible && row.kpiQualified
        ? expiredBonusPerRecipient
        : 0;
      const poolPayout = roundMoney(row.poolPayout + expiredCarryBonus);
      let carryForwardOut = 0;
      let carryExpired = expiredByEmployee.get(row.member.employeeId) ?? 0;
      let finalPayout = 0;
      let status: MarketingMemberCalculation['status'] = 'no_payout';

      if (!row.isFullyEligible) {
        finalPayout = poolPayout;
        status = finalPayout > 0 ? 'pending_pay' : 'no_payout';
      } else if (row.kpiQualified) {
        finalPayout = roundMoney(poolPayout + carryForwardIn);
        status = finalPayout > 0 ? 'pending_pay' : 'no_payout';
        if (carryForwardIn > 0) recoveredCarryEmployeeIds.push(row.member.employeeId);
      } else {
        carryForwardOut = poolPayout;
        status = 'carried_forward';
        if (carryExpired > 0) expiredCarryEmployeeIds.push(row.member.employeeId);
        if (carryForwardOut > 0) {
          newCarryForwards.push({ employeeId: row.member.employeeId, amount: carryForwardOut });
        }
      }

      return {
        employeeId: row.member.employeeId,
        roleLevel: row.member.roleLevel,
        tenureMonth: row.tenureMonth,
        rampPercent: row.rampPercent,
        rampOverridePercent: row.member.rampOverridePercent ?? null,
        achievedCandidates: row.member.achievedCandidates,
        targetCandidates: kpiTarget,
        kpiQualified: row.kpiQualified,
        kpiExempt: row.member.kpiExempt,
        includeInTeamPool: row.member.includeInTeamPool,
        memberCount,
        baseShare,
        rampedAmount: row.rampedAmount,
        redistributionBonus: row.redistributionBonus,
        expiredCarryBonus,
        poolPayout,
        carryForwardIn,
        carryForwardOut,
        carryExpired,
        finalPayout,
        status,
        trace: {
          rampDifference,
          rampBonusPerFull,
          totalExpired,
          expiredBonusPerRecipient,
        },
      };
    });

    return {
      trace,
      netProfit,
      teamCommissionPool,
      leaderBase,
      bigLeaderEmployeeId: input.bigLeaderEmployeeId,
      bigLeaderCommission,
      memberCount,
      baseShare,
      members,
      redistributions,
      newCarryForwards,
      recoveredCarryEmployeeIds,
      expiredCarryEmployeeIds,
    };
  }

  calculateNetProfit(
    financial: MarketingFinancialInput,
    promotionThreshold = MARKETING_PROMOTION_GROSS_THRESHOLD,
    companyHeadRate = MARKETING_COMPANY_HEAD_DEDUCTION_RATE,
  ): NetProfitTrace {
    const promotionExpenseApplied = financial.grossProfit > promotionThreshold
      ? financial.promotionExpense
      : 0;
    const profitAfterExpenses = roundMoney(
      financial.grossProfit
      - financial.employeeSalaryExpense
      - financial.marketingExpense
      - financial.lineExpense
      - financial.telesalesExpense
      - promotionExpenseApplied,
    );
    const companyHeadDeduction = roundMoney(
      profitAfterExpenses * companyHeadRate,
    );
    const netProfit = roundMoney(profitAfterExpenses - companyHeadDeduction);

    return {
      grossProfit: financial.grossProfit,
      employeeSalaryExpense: financial.employeeSalaryExpense,
      marketingExpense: financial.marketingExpense,
      lineExpense: financial.lineExpense,
      telesalesExpense: financial.telesalesExpense,
      promotionExpenseApplied,
      promotionExpenseSkipped: promotionExpenseApplied === 0,
      profitAfterExpenses,
      companyHeadDeductionRate: companyHeadRate,
      companyHeadDeduction,
      netProfit,
    };
  }

  tenureMonth(hireDate: Date, asOf: Date): number {
    let months = (asOf.getFullYear() - hireDate.getFullYear()) * 12
      + (asOf.getMonth() - hireDate.getMonth());
    if (asOf.getDate() < hireDate.getDate()) months -= 1;
    return Math.max(1, months + 1);
  }

  resolveRampPercent(
    tenureMonth: number,
    overridePercent?: number | null,
    rampByTenureMonth: Record<number, number> = RAMP_BY_TENURE_MONTH,
  ): number {
    if (overridePercent != null) return roundMoney(overridePercent / 100);
    if (tenureMonth >= 6) return 1;
    return rampByTenureMonth[tenureMonth] ?? 0;
  }
}

export function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
