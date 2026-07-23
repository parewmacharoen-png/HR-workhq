// ============================================================================
// Executive Copilot — read-only insight payloads
// ============================================================================

export interface ExecutiveInsightScope {
  companyId: string | null;
  scope: 'all_companies' | 'company' | 'leader';
  snapshotDate: string;
  teamId?: string | null;
}

export interface ExecutiveHeadline {
  headcountActive: number;
  attendanceRate: number;
  financeNet: number;
  payrollNet: number;
  pendingApprovals: number;
  riskAlertCount: number;
  commissionOnHold: number;
}

export interface ExecutiveLeaveSummary {
  pendingRequests: number;
  approvedMtd: number;
  rejectedMtd: number;
}

export interface ExecutiveMarketingSummary {
  totalExpense: number;
  depositRoi: number | null;
  topTeamName: string | null;
  bottomTeamName: string | null;
  atRiskEmployeeCount: number;
}

export interface ExecutiveCommissionSummary {
  totalCommissionExpense: number;
  totalPaid: number;
  totalPending: number;
  totalHold: number;
}

export interface ExecutiveSummaryPayload {
  scope: ExecutiveInsightScope;
  generatedAt: string;
  headline: ExecutiveHeadline;
  finance: { revenue: number; expenses: number; net: number } | null;
  payroll: { totalGross: number; totalNet: number; cycleStatus: string } | null;
  attendance: { rate: number; late: number; absent: number } | null;
  headcount: { active: number; probation: number; terminatedMtd: number } | null;
  leave: ExecutiveLeaveSummary;
  marketing: ExecutiveMarketingSummary | null;
  commission: ExecutiveCommissionSummary | null;
  workflows: { pending: number; byType: Record<string, number> } | null;
}

export interface ExecutiveRisk {
  code: string;
  severity: 'high' | 'medium' | 'low';
  category: string;
  message: string;
  count?: number;
}

export interface ExecutiveRisksPayload {
  scope: ExecutiveInsightScope;
  risks: ExecutiveRisk[];
}

export interface ExecutiveForecast {
  projectedNetProfit: number | null;
  projectedCommissionPayout: number | null;
  projectedPayrollNet: number | null;
  projectedMarketingExpense: number | null;
  projectedStartedWork: number | null;
}

export interface ExecutiveForecastPayload {
  scope: ExecutiveInsightScope;
  forecast: ExecutiveForecast;
}

export interface ExecutiveOpportunity {
  code: string;
  message: string;
  metric?: number;
}

export interface ExecutiveRecommendationsPayload {
  scope: ExecutiveInsightScope;
  opportunities: ExecutiveOpportunity[];
  recommendations: string[];
}

export interface ExecutiveDailyBriefSection {
  period: 'today' | 'yesterday' | 'mtd';
  label: string;
  headline: ExecutiveHeadline;
  financeNet: number;
  payrollNet: number;
  attendanceRate: number;
  pendingApprovals: number;
  riskCount: number;
  recommendations: string[];
}

export interface ExecutiveDailyBriefPayload {
  scope: ExecutiveInsightScope;
  generatedAt: string;
  today: ExecutiveDailyBriefSection;
  yesterday: ExecutiveDailyBriefSection;
  mtd: ExecutiveDailyBriefSection;
}
