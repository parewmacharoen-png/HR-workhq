// ============================================================================
// MarketingInsightBuilder — pure ranking, risk, forecast, and anomaly logic
// ============================================================================

import {
  classifyRiskLevel,
  MARKETING_KPI_TARGET,
  MarketingKpiRiskLevel,
} from './marketing-kpi-aggregation.service';
import type {
  MarketingAnomaly,
  MarketingEmployeeRankingEntry,
  MarketingExpenseRankingEntry,
  MarketingForecast,
  MarketingRiskAlert,
  MarketingTeamComparisonRow,
  MarketingTeamRankingEntry,
} from '../../application/dto/marketing-insight.dto';

export interface InsightEmployeeRow {
  employeeId: string;
  employeeName: string;
  teamId: string | null;
  teamName: string | null;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  conversionPercent: number;
  qualified: boolean;
  carryForwardAmount?: number;
}

export interface InsightTeamRow {
  teamId: string;
  teamName: string;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  totalExpense: number;
  depositRoi: number | null;
  costPerStartedWork: number | null;
  passedKpi: number;
  totalEmployees: number;
}

export interface InsightCategorySpend {
  category: string;
  amount: number;
}

export function rankTeamsByRoi(teams: InsightTeamRow[]): MarketingTeamRankingEntry[] {
  const sorted = [...teams].sort((a, b) => (b.depositRoi ?? -Infinity) - (a.depositRoi ?? -Infinity));
  return sorted.map((team, index) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    depositRoi: team.depositRoi,
    totalExpense: team.totalExpense,
    startedWorkCount: team.startedWorkCount,
    costPerStartedWork: team.costPerStartedWork,
    kpiSuccessRatePercent: team.totalEmployees > 0
      ? round2((team.passedKpi / team.totalEmployees) * 100)
      : 0,
    rank: index + 1,
  }));
}

export function rankEmployeesByStartedWork(
  employees: InsightEmployeeRow[],
): MarketingEmployeeRankingEntry[] {
  const sorted = [...employees].sort((a, b) => b.startedWorkCount - a.startedWorkCount);
  return sorted.map((employee, index) => ({
    employeeId: employee.employeeId,
    employeeName: employee.employeeName,
    teamName: employee.teamName,
    startedWorkCount: employee.startedWorkCount,
    conversionPercent: employee.conversionPercent,
    qualified: employee.qualified,
    riskLevel: employee.qualified ? 'qualified' : classifyRiskLevel(employee.startedWorkCount),
    rank: index + 1,
  }));
}

export function rankExpensesByTeam(teams: InsightTeamRow[]): MarketingExpenseRankingEntry[] {
  const sorted = [...teams].sort((a, b) => b.totalExpense - a.totalExpense);
  return sorted.map((team, index) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    totalExpense: team.totalExpense,
    costPerStartedWork: team.costPerStartedWork,
    rank: index + 1,
  }));
}

export function splitTopBottomTeams(
  ranking: MarketingTeamRankingEntry[],
  limit = 3,
): { topTeams: MarketingTeamRankingEntry[]; bottomTeams: MarketingTeamRankingEntry[] } {
  const eligible = ranking.filter((t) => t.startedWorkCount > 0 || t.totalExpense > 0);
  return {
    topTeams: eligible.slice(0, limit),
    bottomTeams: [...eligible].reverse().slice(0, limit),
  };
}

export function filterFailedKpiEmployees(
  employees: MarketingEmployeeRankingEntry[],
): MarketingEmployeeRankingEntry[] {
  return employees.filter((e) => !e.qualified && e.riskLevel !== 'qualified');
}

export function filterAtRiskEmployees(
  employees: MarketingEmployeeRankingEntry[],
): MarketingEmployeeRankingEntry[] {
  return employees.filter((e) => e.riskLevel === 'at_risk' || e.riskLevel === 'high_risk');
}

export function buildExpenseAnomalies(
  categories: InsightCategorySpend[],
  totalExpense: number,
): MarketingAnomaly[] {
  if (totalExpense <= 0) return [];
  const anomalies: MarketingAnomaly[] = [];
  const avgCategory = categories.length > 0
    ? categories.reduce((sum, row) => sum + row.amount, 0) / categories.length
    : 0;

  for (const row of categories) {
    if (avgCategory > 0 && row.amount >= avgCategory * 2 && row.amount >= 5_000) {
      anomalies.push({
        type: 'expense_category',
        message: `Category ${row.category} spend is unusually high`,
        value: row.amount,
        benchmark: round2(avgCategory),
      });
    }
    if (totalExpense > 0 && row.amount / totalExpense >= 0.45) {
      anomalies.push({
        type: 'expense_category',
        message: `Category ${row.category} represents over 45% of total spend`,
        value: row.amount,
        benchmark: round2(totalExpense * 0.45),
      });
    }
  }
  return anomalies;
}

export function buildTeamExpenseAnomalies(
  teams: InsightTeamRow[],
): MarketingAnomaly[] {
  if (teams.length === 0) return [];
  const avgExpense = teams.reduce((sum, t) => sum + t.totalExpense, 0) / teams.length;
  if (avgExpense <= 0) return [];

  return teams
    .filter((team) => team.totalExpense >= avgExpense * 1.5 && team.totalExpense >= 10_000)
    .map((team) => ({
      type: 'team_expense' as const,
      message: `${team.teamName} spending is above peer average`,
      value: team.totalExpense,
      benchmark: round2(avgExpense),
    }));
}

export function buildConversionAnomalies(
  teams: InsightTeamRow[],
): MarketingAnomaly[] {
  const withContact = teams.filter((t) => t.contactedCount > 0);
  if (withContact.length === 0) return [];
  const avgConversion = withContact.reduce(
    (sum, t) => sum + (t.startedWorkCount / t.contactedCount),
    0,
  ) / withContact.length;
  if (avgConversion <= 0) return [];

  return withContact
    .filter((team) => (team.startedWorkCount / team.contactedCount) < avgConversion * 0.5)
    .map((team) => ({
      type: 'conversion' as const,
      message: `${team.teamName} conversion rate is well below company average`,
      value: round2((team.startedWorkCount / team.contactedCount) * 100),
      benchmark: round2(avgConversion * 100),
    }));
}

export function buildRiskAlerts(input: {
  teams: InsightTeamRow[];
  employees: MarketingEmployeeRankingEntry[];
  carryForwardTotal: number;
  pendingAdjustments: number;
  companyAvgExpense: number;
}): {
  highExpenseAlerts: MarketingRiskAlert[];
  lowConversionAlerts: MarketingRiskAlert[];
  kpiRiskAlerts: MarketingRiskAlert[];
  carryForwardRisk: MarketingRiskAlert[];
  adjustmentRisk: MarketingRiskAlert[];
} {
  const highExpenseAlerts = input.teams
    .filter((t) => input.companyAvgExpense > 0 && t.totalExpense >= input.companyAvgExpense * 1.5)
    .map((team) => ({
      code: 'HIGH_TEAM_EXPENSE',
      severity: team.totalExpense >= input.companyAvgExpense * 2 ? 'high' as const : 'medium' as const,
      message: `${team.teamName} expense is above normal`,
      teamId: team.teamId,
      teamName: team.teamName,
      metric: team.totalExpense,
    }));

  const lowConversionAlerts = input.teams
    .filter((t) => t.contactedCount >= 20 && calculateConversion(t) < 15)
    .map((team) => ({
      code: 'LOW_CONVERSION',
      severity: calculateConversion(team) < 10 ? 'high' as const : 'medium' as const,
      message: `${team.teamName} conversion is low`,
      teamId: team.teamId,
      teamName: team.teamName,
      metric: calculateConversion(team),
    }));

  const kpiRiskAlerts = input.employees
    .filter((e) => e.riskLevel === 'high_risk' || e.riskLevel === 'at_risk')
    .map((employee) => ({
      code: employee.riskLevel === 'high_risk' ? 'KPI_HIGH_RISK' : 'KPI_AT_RISK',
      severity: employee.riskLevel === 'high_risk' ? 'high' as const : 'medium' as const,
      message: `${employee.employeeName} may miss KPI target (${employee.startedWorkCount}/${MARKETING_KPI_TARGET})`,
      employeeId: employee.employeeId,
      employeeName: employee.employeeName,
      metric: employee.startedWorkCount,
    }));

  const carryForwardRisk = input.carryForwardTotal > 0
    ? [{
      code: 'CARRY_FORWARD',
      severity: input.carryForwardTotal >= 50_000 ? 'high' as const : 'medium' as const,
      message: `Carry forward exposure is ${round2(input.carryForwardTotal)}`,
      metric: round2(input.carryForwardTotal),
    }]
    : [];

  const adjustmentRisk = input.pendingAdjustments > 0
    ? [{
      code: 'COMMISSION_ADJUSTMENT',
      severity: input.pendingAdjustments >= 3 ? 'high' as const : 'low' as const,
      message: `${input.pendingAdjustments} commission adjustment request(s) pending review`,
      metric: input.pendingAdjustments,
    }]
    : [];

  return {
    highExpenseAlerts,
    lowConversionAlerts,
    kpiRiskAlerts,
    carryForwardRisk,
    adjustmentRisk,
  };
}

export function buildForecast(input: {
  projectedStartedWorkCount: number;
  projectedExpenses: number;
  projectedCommissionPool: number | null;
  projectedCarryForward: number | null;
  projectedDepositAmount: number;
}): MarketingForecast {
  const projectedNetProfit = input.projectedDepositAmount > 0
    ? round2(input.projectedDepositAmount - input.projectedExpenses)
    : null;

  return {
    projectedStartedWorkCount: input.projectedStartedWorkCount,
    projectedExpenses: round2(input.projectedExpenses),
    projectedCommissionPool: input.projectedCommissionPool,
    projectedCarryForward: input.projectedCarryForward,
    projectedNetProfit,
  };
}

export function buildRecommendations(input: {
  bottomTeams: MarketingTeamRankingEntry[];
  atRiskEmployees: MarketingEmployeeRankingEntry[];
  anomalies: MarketingAnomaly[];
  carryForwardTotal: number;
}): string[] {
  const recommendations: string[] = [];

  if (input.bottomTeams.length > 0) {
    recommendations.push(
      `Review underperforming team ${input.bottomTeams[0].teamName} — ROI ${input.bottomTeams[0].depositRoi ?? 0}% with expense ${input.bottomTeams[0].totalExpense}.`,
    );
  }
  if (input.atRiskEmployees.length > 0) {
    recommendations.push(
      `Coach ${input.atRiskEmployees.slice(0, 3).map((e) => e.employeeName).join(', ')} on started-work conversion before cycle close.`,
    );
  }
  if (input.anomalies.some((a) => a.type === 'expense_category')) {
    recommendations.push('Audit high-spend expense categories and reallocate budget to higher-converting teams.');
  }
  if (input.carryForwardTotal > 0) {
    recommendations.push('Monitor carry-forward exposure before finalizing commission for this cycle.');
  }
  if (recommendations.length === 0) {
    recommendations.push('Marketing performance is stable — continue monitoring daily reports and expense approvals.');
  }
  return recommendations;
}

export function buildTeamComparisonRows(teams: InsightTeamRow[]): MarketingTeamComparisonRow[] {
  return teams.map((team) => ({
    teamId: team.teamId,
    teamName: team.teamName,
    contactedCount: team.contactedCount,
    newMemberCount: team.newMemberCount,
    depositAmount: round2(team.depositAmount),
    startedWorkCount: team.startedWorkCount,
    expenses: round2(team.totalExpense),
    costPerStartedWork: team.costPerStartedWork,
    roi: team.depositRoi,
    kpiSuccessRatePercent: team.totalEmployees > 0
      ? round2((team.passedKpi / team.totalEmployees) * 100)
      : 0,
  }));
}

function calculateConversion(team: InsightTeamRow): number {
  if (team.contactedCount <= 0) return 0;
  return round2((team.startedWorkCount / team.contactedCount) * 100);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
