// ============================================================================
// Commission Executive Dashboard — typed payload shapes
// ============================================================================

export interface CommissionDashboardDateRange {
  from: Date;
  to: Date;
  label: 'custom' | 'month_to_date' | 'previous_month';
}

export interface TopEarnerEntry {
  employeeId: string;
  employeeName: string;
  amount: number;
  companyId?: string;
  companyName?: string;
}

export interface MarketingCommissionDashboardMetrics {
  overview: {
    netProfit: number;
    teamCommissionPool: number;
    paidCommission: number;
    holdAmount: number;
    carryForwardAmount: number;
    recoveryAmount: number;
    expiredAmount: number;
    redistributedAmount: number;
    bigLeaderCommission: number;
  };
  teamStatistics: {
    totalMembers: number;
    qualifiedMembers: number;
    holdMembers: number;
    newHireMembers: number;
    averageCommission: number;
  };
  kpiStatistics: {
    passedKpi: number;
    failedKpi: number;
    successRatePercent: number;
  };
}

export interface AdminCommissionDashboardMetrics {
  overview: {
    adminPool: number;
    poolA: number;
    poolB: number;
    totalPayable: number;
    totalPenalties: number;
    totalRedistributed: number;
  };
  employeeBreakdown: {
    frontOfficeTotal: number;
    backOfficeTotal: number;
    employeesPenalized: number;
    averagePenaltyPercent: number;
  };
  shiftStatistics: {
    dayShiftTotal: number;
    nightShiftTotal: number;
    shiftTransfers: number;
  };
}

export interface ReferralCommissionDashboardMetrics {
  overview: {
    pendingReferrals: number;
    qualifiedReferrals: number;
    paidReferrals: number;
  };
  financial: {
    pendingRewards: number;
    qualifiedRewards: number;
    paidRewards: number;
    totalReferralCost: number;
  };
  conversion: {
    referralToQualifiedPercent: number;
    qualifiedToPaidPercent: number;
  };
}

export interface RecruitmentCommissionDashboardMetrics {
  overview: {
    recruitersQualified: number;
    recruitersOnHold: number;
    recruitersFailedTarget: number;
  };
  candidateMetrics: {
    totalCandidates: number;
    qualifiedCandidates: number;
    hiredCandidates: number;
  };
  commissionMetrics: {
    qualifiedCommission: number;
    holdCommission: number;
    paidCommission: number;
  };
}

export interface CommissionExecutiveSummary {
  totalCommissionExpense: number;
  totalPaid: number;
  totalPending: number;
  totalHold: number;
  totalCarryForward: number;
  totalRedistributed: number;
  totalReferralCost: number;
  topMarketingEarners: TopEarnerEntry[];
  topRecruiters: TopEarnerEntry[];
  highestAdminCommission: TopEarnerEntry[];
  highestReferralEarners: TopEarnerEntry[];
}

export interface CommissionExecutiveDashboard {
  meta: {
    generatedAt: string;
    from: string;
    to: string;
    companyId: string | null;
    companyName: string | null;
    earnCycleId: string | null;
    dateRangeLabel: CommissionDashboardDateRange['label'];
  };
  marketing: MarketingCommissionDashboardMetrics;
  admin: AdminCommissionDashboardMetrics;
  referral: ReferralCommissionDashboardMetrics;
  recruitment: RecruitmentCommissionDashboardMetrics;
  executiveSummary: CommissionExecutiveSummary;
  marketingExpenses?: {
    totalExpense: number;
    costPerContact: number | null;
    costPerNewMember: number | null;
    costPerStartedWork: number | null;
    depositRoi: number | null;
    byCategory: Record<string, number>;
  } | null;
  previousMonth?: CommissionExecutiveSummary;
}

export type CommissionDashboardBlock = Pick<
  CommissionExecutiveDashboard,
  'marketing' | 'admin' | 'referral' | 'recruitment' | 'executiveSummary'
>;

export interface CommissionDashboardQuery {
  companyId?: string;
  earnCycleId?: string;
  from?: Date;
  to?: Date;
  comparePreviousMonth?: boolean;
}

export interface RawCompanyCommissionMetrics {
  companyId: string;
  companyName: string;
  marketing: MarketingCommissionDashboardMetrics;
  admin: AdminCommissionDashboardMetrics;
  referral: ReferralCommissionDashboardMetrics;
  recruitment: RecruitmentCommissionDashboardMetrics;
  topMarketingEarners: TopEarnerEntry[];
  topRecruiters: TopEarnerEntry[];
  highestAdminCommission: TopEarnerEntry[];
  highestReferralEarners: TopEarnerEntry[];
}
