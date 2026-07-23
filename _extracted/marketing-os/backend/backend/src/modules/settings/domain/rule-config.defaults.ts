// ============================================================================
// Default commission rule configs (used when no DB version exists)
// ============================================================================

export interface MarketingCommissionRuleConfig {
  kpiTargetDefault: number;
  teamPoolPercent: number;
  bigLeaderPercent: number;
  newHireRamp: {
    month1: number;
    month2: number;
    month3: number;
    month4: number;
    month5: number;
    month6Plus: number;
  };
  carryForwardMaxMonths: number;
  promotionExpenseThreshold: number;
  companyHeadDeductionPercent: number;
}

export interface AdminCommissionRuleConfig {
  poolAPercent: number;
  poolBPercent: number;
  normalLeaveAllowanceDays: number;
  leavePenaltyTiers: Array<{ minExtraDays: number; deductionPercent: number }>;
}

export const DEFAULT_MARKETING_COMMISSION_CONFIG: MarketingCommissionRuleConfig = {
  kpiTargetDefault: 24,
  teamPoolPercent: 10,
  bigLeaderPercent: 5,
  newHireRamp: {
    month1: 0,
    month2: 20,
    month3: 20,
    month4: 30,
    month5: 40,
    month6Plus: 100,
  },
  carryForwardMaxMonths: 1,
  promotionExpenseThreshold: 500_000,
  companyHeadDeductionPercent: 40,
};

export const DEFAULT_ADMIN_COMMISSION_CONFIG: AdminCommissionRuleConfig = {
  poolAPercent: 1,
  poolBPercent: 1,
  normalLeaveAllowanceDays: 4,
  leavePenaltyTiers: [
    { minExtraDays: 10, deductionPercent: 100 },
    { minExtraDays: 9, deductionPercent: 80 },
    { minExtraDays: 8, deductionPercent: 70 },
    { minExtraDays: 7, deductionPercent: 60 },
    { minExtraDays: 6, deductionPercent: 50 },
    { minExtraDays: 3, deductionPercent: 40 },
    { minExtraDays: 2, deductionPercent: 30 },
  ],
};

export type RuleConfigDomainKey = 'marketing_commission' | 'admin_commission';
