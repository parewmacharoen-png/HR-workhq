// ============================================================================
// Marketing KPI pure helpers — qualification, remaining count, risk classification
// Business rule: 24 started-work candidates per earn cycle (COM-MKT KPI).
// ============================================================================

import { MARKETING_KPI_TARGET } from './marketing-commission-calculation.service';

export type MarketingKpiRiskLevel = 'high_risk' | 'at_risk' | 'qualified';

export function remainingKpiCount(startedWorkCount: number, targetCount = MARKETING_KPI_TARGET): number {
  return Math.max(0, targetCount - startedWorkCount);
}

export function isMarketingKpiQualified(
  startedWorkCount: number,
  targetCount = MARKETING_KPI_TARGET,
  kpiExempt = false,
): boolean {
  if (kpiExempt) return true;
  return startedWorkCount >= targetCount;
}

/** 0–15 high, 16–23 at risk, 24+ qualified */
export function classifyMarketingKpiRisk(startedWorkCount: number): MarketingKpiRiskLevel {
  if (startedWorkCount >= MARKETING_KPI_TARGET) return 'qualified';
  if (startedWorkCount >= 16) return 'at_risk';
  return 'high_risk';
}
