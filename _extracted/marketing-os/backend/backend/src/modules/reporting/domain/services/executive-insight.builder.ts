// ============================================================================
// ExecutiveInsightBuilder — pure risk, forecast, and recommendation logic
// ============================================================================

import type {
  ExecutiveForecast,
  ExecutiveHeadline,
  ExecutiveOpportunity,
  ExecutiveRisk,
} from '../../application/dto/executive-insight.dto';

export interface ExecutiveRiskInput {
  alerts: Array<{ severity: string; category: string; message: string; count?: number }>;
  commissionOnHold: number;
  pendingApprovals: number;
  attendanceRate: number;
  marketingAtRiskCount: number;
  pendingAdjustments: number;
}

export interface ExecutiveForecastInput {
  financeNet: number | null;
  payrollNet: number | null;
  commissionPending: number | null;
  marketingExpense: number | null;
  marketingStartedWork: number | null;
}

export interface ExecutiveRecommendationInput {
  risks: ExecutiveRisk[];
  opportunities: ExecutiveOpportunity[];
  bottomTeamName: string | null;
  topTeamName: string | null;
  financeNet: number;
  pendingApprovals: number;
}

export function buildExecutiveRisks(input: ExecutiveRiskInput): ExecutiveRisk[] {
  const risks: ExecutiveRisk[] = input.alerts.map((alert) => ({
    code: `${alert.category}_${alert.severity}`.toUpperCase(),
    severity: normalizeSeverity(alert.severity),
    category: alert.category,
    message: alert.message,
    count: alert.count,
  }));

  if (input.commissionOnHold > 0) {
    risks.push({
      code: 'COMMISSION_HOLD',
      severity: input.commissionOnHold >= 5 ? 'high' : 'medium',
      category: 'commission',
      message: `${input.commissionOnHold} commission record(s) on hold`,
      count: input.commissionOnHold,
    });
  }

  if (input.pendingApprovals >= 10) {
    risks.push({
      code: 'WORKFLOW_BACKLOG',
      severity: input.pendingApprovals >= 20 ? 'high' : 'medium',
      category: 'workflow',
      message: `${input.pendingApprovals} pending approvals across workflows`,
      count: input.pendingApprovals,
    });
  }

  if (input.attendanceRate > 0 && input.attendanceRate < 85) {
    risks.push({
      code: 'LOW_ATTENDANCE',
      severity: input.attendanceRate < 75 ? 'high' : 'medium',
      category: 'attendance',
      message: `Attendance rate is ${round2(input.attendanceRate)}%`,
      count: undefined,
    });
  }

  if (input.marketingAtRiskCount > 0) {
    risks.push({
      code: 'MARKETING_KPI_RISK',
      severity: input.marketingAtRiskCount >= 3 ? 'high' : 'medium',
      category: 'marketing',
      message: `${input.marketingAtRiskCount} marketer(s) at KPI risk`,
      count: input.marketingAtRiskCount,
    });
  }

  if (input.pendingAdjustments > 0) {
    risks.push({
      code: 'COMMISSION_ADJUSTMENT',
      severity: 'low',
      category: 'commission',
      message: `${input.pendingAdjustments} commission adjustment(s) pending`,
      count: input.pendingAdjustments,
    });
  }

  return risks.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
}

export function buildExecutiveForecast(input: ExecutiveForecastInput): ExecutiveForecast {
  return {
    projectedNetProfit: input.financeNet,
    projectedCommissionPayout: input.commissionPending,
    projectedPayrollNet: input.payrollNet,
    projectedMarketingExpense: input.marketingExpense,
    projectedStartedWork: input.marketingStartedWork,
  };
}

export function buildExecutiveOpportunities(input: {
  topTeamName: string | null;
  topTeamRoi: number | null;
  financeNet: number;
  attendanceRate: number;
}): ExecutiveOpportunity[] {
  const opportunities: ExecutiveOpportunity[] = [];

  if (input.topTeamName && (input.topTeamRoi ?? 0) > 0) {
    opportunities.push({
      code: 'TOP_MARKETING_TEAM',
      message: `${input.topTeamName} leads marketing ROI at ${round2(input.topTeamRoi ?? 0)}%`,
      metric: input.topTeamRoi ?? undefined,
    });
  }

  if (input.financeNet > 0) {
    opportunities.push({
      code: 'POSITIVE_NET',
      message: `Finance net is positive at ฿${round2(input.financeNet).toLocaleString()}`,
      metric: input.financeNet,
    });
  }

  if (input.attendanceRate >= 95) {
    opportunities.push({
      code: 'STRONG_ATTENDANCE',
      message: `Attendance rate is strong at ${round2(input.attendanceRate)}%`,
      metric: input.attendanceRate,
    });
  }

  return opportunities;
}

export function buildExecutiveRecommendations(input: ExecutiveRecommendationInput): string[] {
  const recommendations: string[] = [];
  const highRisks = input.risks.filter((r) => r.severity === 'high');

  if (highRisks.length > 0) {
    recommendations.push(`Address high-priority risk: ${highRisks[0].message}`);
  }

  if (input.pendingApprovals >= 10) {
    recommendations.push('Clear workflow backlog to avoid payroll and commission delays.');
  }

  if (input.bottomTeamName && input.topTeamName && input.bottomTeamName !== input.topTeamName) {
    recommendations.push(`Review ${input.bottomTeamName} performance against benchmark team ${input.topTeamName}.`);
  }

  if (input.financeNet < 0) {
    recommendations.push('Finance net is negative — review expense approvals and marketing ROI.');
  }

  for (const opportunity of input.opportunities.slice(0, 2)) {
    recommendations.push(`Leverage opportunity: ${opportunity.message}`);
  }

  if (recommendations.length === 0) {
    recommendations.push('Business metrics are stable — continue monitoring daily executive brief.');
  }

  return recommendations;
}

export function buildExecutiveHeadline(input: {
  headcountActive: number;
  attendanceRate: number;
  financeNet: number;
  payrollNet: number;
  pendingApprovals: number;
  riskAlertCount: number;
  commissionOnHold: number;
}): ExecutiveHeadline {
  return {
    headcountActive: input.headcountActive,
    attendanceRate: round2(input.attendanceRate),
    financeNet: round2(input.financeNet),
    payrollNet: round2(input.payrollNet),
    pendingApprovals: input.pendingApprovals,
    riskAlertCount: input.riskAlertCount,
    commissionOnHold: input.commissionOnHold,
  };
}

function normalizeSeverity(value: string): 'high' | 'medium' | 'low' {
  if (value === 'high' || value === 'critical') return 'high';
  if (value === 'low') return 'low';
  return 'medium';
}

function severityRank(severity: 'high' | 'medium' | 'low'): number {
  if (severity === 'high') return 3;
  if (severity === 'medium') return 2;
  return 1;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
