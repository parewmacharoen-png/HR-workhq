// ============================================================================
// marketing-insight.builder.unit.spec.ts
// ============================================================================

import {
  buildExpenseAnomalies,
  buildForecast,
  buildRiskAlerts,
  buildTeamExpenseAnomalies,
  filterAtRiskEmployees,
  filterFailedKpiEmployees,
  InsightEmployeeRow,
  InsightTeamRow,
  rankEmployeesByStartedWork,
  rankTeamsByRoi,
  splitTopBottomTeams,
} from './marketing-insight.builder';

describe('MarketingInsightBuilder', () => {
  const teams: InsightTeamRow[] = [
    {
      teamId: 't1',
      teamName: 'Alpha',
      contactedCount: 200,
      newMemberCount: 80,
      depositAmount: 100_000,
      startedWorkCount: 26,
      totalExpense: 20_000,
      depositRoi: 400,
      costPerStartedWork: 769,
      passedKpi: 2,
      totalEmployees: 3,
    },
    {
      teamId: 't2',
      teamName: 'Beta',
      contactedCount: 180,
      newMemberCount: 40,
      depositAmount: 40_000,
      startedWorkCount: 10,
      totalExpense: 60_000,
      depositRoi: 89,
      costPerStartedWork: 4500,
      passedKpi: 0,
      totalEmployees: 2,
    },
  ];

  const employees: InsightEmployeeRow[] = [
    {
      employeeId: 'e1',
      employeeName: 'Alice',
      teamId: 't1',
      teamName: 'Alpha',
      contactedCount: 100,
      newMemberCount: 40,
      depositAmount: 50_000,
      startedWorkCount: 24,
      conversionPercent: 24,
      qualified: true,
    },
    {
      employeeId: 'e2',
      employeeName: 'Bob',
      teamId: 't2',
      teamName: 'Beta',
      contactedCount: 90,
      newMemberCount: 20,
      depositAmount: 20_000,
      startedWorkCount: 8,
      conversionPercent: 8.9,
      qualified: false,
    },
  ];

  it('ranks teams by ROI descending', () => {
    const ranking = rankTeamsByRoi(teams);
    expect(ranking[0].teamId).toBe('t1');
    expect(ranking[1].teamId).toBe('t2');
  });

  it('ranks employees by started work descending', () => {
    const ranking = rankEmployeesByStartedWork(employees);
    expect(ranking[0].employeeId).toBe('e1');
    expect(ranking[1].riskLevel).toBe('high_risk');
  });

  it('identifies failed and at-risk employees', () => {
    const ranking = rankEmployeesByStartedWork(employees);
    expect(filterFailedKpiEmployees(ranking)).toHaveLength(1);
    expect(filterAtRiskEmployees(ranking)).toHaveLength(1);
  });

  it('splits top and bottom teams', () => {
    const ranking = rankTeamsByRoi(teams);
    const { topTeams, bottomTeams } = splitTopBottomTeams(ranking);
    expect(topTeams[0].teamName).toBe('Alpha');
    expect(bottomTeams[0].teamName).toBe('Beta');
  });

  it('classifies high expense and KPI risk alerts', () => {
    const employeeRanking = rankEmployeesByStartedWork(employees);
    const alerts = buildRiskAlerts({
      teams,
      employees: employeeRanking,
      carryForwardTotal: 60_000,
      pendingAdjustments: 2,
      companyAvgExpense: 40_000,
    });
    expect(alerts.highExpenseAlerts.some((a) => a.teamName === 'Beta')).toBe(true);
    expect(alerts.kpiRiskAlerts.some((a) => a.employeeName === 'Bob')).toBe(true);
    expect(alerts.carryForwardRisk).toHaveLength(1);
    expect(alerts.adjustmentRisk).toHaveLength(1);
  });

  it('builds forecast from projected inputs', () => {
    const forecast = buildForecast({
      projectedStartedWorkCount: 34,
      projectedExpenses: 65_000,
      projectedCommissionPool: 120_000,
      projectedCarryForward: 15_000,
      projectedDepositAmount: 140_000,
    });
    expect(forecast.projectedStartedWorkCount).toBe(34);
    expect(forecast.projectedNetProfit).toBe(75_000);
  });

  it('detects expense category and team anomalies', () => {
    const categoryAnomalies = buildExpenseAnomalies(
      [
        { category: 'advertising', amount: 40_000 },
        { category: 'other', amount: 2_000 },
      ],
      42_000,
    );
    expect(categoryAnomalies.length).toBeGreaterThan(0);
    expect(buildTeamExpenseAnomalies(teams).some((a) => a.message.includes('Beta'))).toBe(true);
  });
});
