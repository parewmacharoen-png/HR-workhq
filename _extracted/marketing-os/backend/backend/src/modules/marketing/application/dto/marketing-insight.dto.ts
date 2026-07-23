// ============================================================================
// modules/marketing/application/dto/marketing-insight.dto.ts
// Read-only AI Marketing Manager insight payloads.
// ============================================================================

import type { MarketingKpiRiskLevel } from '../../domain/services/marketing-kpi-aggregation.service';
import type { MarketingExpenseSummaryResponse } from './marketing-expense.dto';

export interface MarketingInsightScope {
  companyId: string;
  earnCycleId: string | null;
  cycleLabel: string | null;
  teamId: string | null;
  rootTeamId: string | null;
}

export interface MarketingTeamRankingEntry {
  teamId: string;
  teamName: string;
  depositRoi: number | null;
  totalExpense: number;
  startedWorkCount: number;
  costPerStartedWork: number | null;
  kpiSuccessRatePercent: number;
  rank: number;
}

export interface MarketingEmployeeRankingEntry {
  employeeId: string;
  employeeName: string;
  teamName: string | null;
  startedWorkCount: number;
  conversionPercent: number;
  qualified: boolean;
  riskLevel: MarketingKpiRiskLevel;
  rank: number;
}

export interface MarketingExpenseRankingEntry {
  teamId: string;
  teamName: string;
  totalExpense: number;
  costPerStartedWork: number | null;
  rank: number;
}

export interface MarketingRiskAlert {
  code: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  teamId?: string;
  teamName?: string;
  employeeId?: string;
  employeeName?: string;
  metric?: number;
}

export interface MarketingForecast {
  projectedStartedWorkCount: number;
  projectedExpenses: number;
  projectedCommissionPool: number | null;
  projectedCarryForward: number | null;
  projectedNetProfit: number | null;
}

export interface MarketingAnomaly {
  type: 'expense_category' | 'team_expense' | 'conversion';
  message: string;
  value: number;
  benchmark: number;
}

export interface MarketingPerformanceInsights {
  scope: MarketingInsightScope;
  teamRanking: MarketingTeamRankingEntry[];
  employeeRanking: MarketingEmployeeRankingEntry[];
  expenseRanking: MarketingExpenseRankingEntry[];
  topTeams: MarketingTeamRankingEntry[];
  bottomTeams: MarketingTeamRankingEntry[];
  topEmployees: MarketingEmployeeRankingEntry[];
  failedKpiEmployees: MarketingEmployeeRankingEntry[];
  atRiskEmployees: MarketingEmployeeRankingEntry[];
  expenseSummary: MarketingExpenseSummaryResponse;
  roiSummary: {
    depositRoi: number | null;
    costPerStartedWork: number | null;
    totalExpense: number;
  };
  anomalies: MarketingAnomaly[];
  recommendations: string[];
}

export interface MarketingRiskAlertsResponse {
  scope: MarketingInsightScope;
  highExpenseAlerts: MarketingRiskAlert[];
  lowConversionAlerts: MarketingRiskAlert[];
  kpiRiskAlerts: MarketingRiskAlert[];
  carryForwardRisk: MarketingRiskAlert[];
  adjustmentRisk: MarketingRiskAlert[];
}

export interface MarketingForecastResponse {
  scope: MarketingInsightScope;
  forecast: MarketingForecast;
}

export interface MarketingTeamComparisonRow {
  teamId: string;
  teamName: string;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  expenses: number;
  costPerStartedWork: number | null;
  roi: number | null;
  kpiSuccessRatePercent: number;
}

export interface MarketingTeamComparisonResponse {
  scope: MarketingInsightScope;
  teams: MarketingTeamComparisonRow[];
}
