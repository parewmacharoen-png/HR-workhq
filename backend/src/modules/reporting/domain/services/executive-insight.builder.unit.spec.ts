// ============================================================================
// executive-insight.builder.unit.spec.ts
// ============================================================================

import {
  buildExecutiveForecast,
  buildExecutiveRecommendations,
  buildExecutiveRisks,
} from './executive-insight.builder';

describe('ExecutiveInsightBuilder', () => {
  it('buildExecutiveRisks adds commission hold and sorts by severity', () => {
    const risks = buildExecutiveRisks({
      alerts: [{ severity: 'medium', category: 'finance', message: 'Expense spike', count: 1 }],
      commissionOnHold: 6,
      pendingApprovals: 3,
      attendanceRate: 95,
      marketingAtRiskCount: 0,
      pendingAdjustments: 0,
    });

    expect(risks.some((r) => r.code === 'COMMISSION_HOLD' && r.severity === 'high')).toBe(true);
    expect(risks[0]?.severity).toBe('high');
  });

  it('buildExecutiveForecast projects finance and commission totals', () => {
    const forecast = buildExecutiveForecast({
      financeNet: 250000,
      payrollNet: 420000,
      commissionPending: 85000,
      marketingExpense: 120000,
      marketingStartedWork: 45,
    });

    expect(forecast).toEqual({
      projectedNetProfit: 250000,
      projectedPayrollNet: 420000,
      projectedCommissionPayout: 85000,
      projectedMarketingExpense: 120000,
      projectedStartedWork: 45,
    });
  });

  it('buildExecutiveRecommendations prioritizes high risks and team review', () => {
    const recommendations = buildExecutiveRecommendations({
      risks: [
        { code: 'LOW_ATTENDANCE', severity: 'high', category: 'attendance', message: 'Attendance rate is 70%' },
      ],
      opportunities: [
        { code: 'TOP_MARKETING_TEAM', message: 'Team Alpha leads marketing ROI at 120%' },
      ],
      bottomTeamName: 'Team Beta',
      topTeamName: 'Team Alpha',
      financeNet: 100000,
      pendingApprovals: 5,
    });

    expect(recommendations[0]).toContain('Attendance rate is 70%');
    expect(recommendations.some((r) => r.includes('Team Beta'))).toBe(true);
  });
});
