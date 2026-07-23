// ============================================================================
// MarketingKpiAggregationService — pure KPI math from daily report totals
// ============================================================================

// Marketing KPI target per earn cycle (COM-MKT KPI)
export const MARKETING_KPI_TARGET = 24;

export type MarketingKpiRiskLevel = 'high_risk' | 'at_risk' | 'qualified';

export type MarketingKpiCountMode = 'projected' | 'final';

export interface MarketingDailyReportTotals {
  reportDate?: Date;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
}

export interface MarketingKpiSnapshot extends MarketingDailyReportTotals {
  targetCount: number;
  remainingCount: number;
  qualified: boolean;
  conversionRatePercent: number;
  riskLevel: MarketingKpiRiskLevel;
}

export const PROJECTED_KPI_STATUSES = ['submitted', 'approved'] as const;
export const FINAL_KPI_STATUSES = ['approved'] as const;

export function sumDailyReportTotals(
  rows: MarketingDailyReportTotals[],
): MarketingDailyReportTotals {
  return rows.reduce(
    (acc, row) => ({
      contactedCount: acc.contactedCount + row.contactedCount,
      newMemberCount: acc.newMemberCount + row.newMemberCount,
      depositAmount: round2(acc.depositAmount + row.depositAmount),
      startedWorkCount: acc.startedWorkCount + row.startedWorkCount,
    }),
    { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 },
  );
}

export function calculateConversionRate(
  startedWorkCount: number,
  contactedCount: number,
): number {
  if (contactedCount <= 0) return 0;
  return round2((startedWorkCount / contactedCount) * 100);
}

export function calculateRemainingCount(
  startedWorkCount: number,
  targetCount = MARKETING_KPI_TARGET,
): number {
  return Math.max(0, targetCount - startedWorkCount);
}

export function calculateQualified(
  startedWorkCount: number,
  targetCount = MARKETING_KPI_TARGET,
  kpiExempt = false,
): boolean {
  if (kpiExempt) return true;
  return startedWorkCount >= targetCount;
}

export function classifyRiskLevel(startedWorkCount: number): MarketingKpiRiskLevel {
  if (startedWorkCount >= MARKETING_KPI_TARGET) return 'qualified';
  if (startedWorkCount >= 16) return 'at_risk';
  return 'high_risk';
}

export function buildKpiSnapshot(
  totals: MarketingDailyReportTotals,
  kpiExempt = false,
  targetCount = MARKETING_KPI_TARGET,
): MarketingKpiSnapshot {
  const remainingCount = kpiExempt ? 0 : calculateRemainingCount(totals.startedWorkCount, targetCount);
  const qualified = calculateQualified(totals.startedWorkCount, targetCount, kpiExempt);
  const riskLevel: MarketingKpiRiskLevel = kpiExempt
    ? 'qualified'
    : classifyRiskLevel(totals.startedWorkCount);

  return {
    ...totals,
    depositAmount: round2(totals.depositAmount),
    targetCount,
    remainingCount,
    qualified,
    conversionRatePercent: calculateConversionRate(totals.startedWorkCount, totals.contactedCount),
    riskLevel,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
