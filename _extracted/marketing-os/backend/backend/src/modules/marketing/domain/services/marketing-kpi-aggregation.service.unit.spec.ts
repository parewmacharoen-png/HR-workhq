// ============================================================================
// marketing-kpi-aggregation.service.unit.spec.ts
// ============================================================================

import {
  buildKpiSnapshot,
  calculateConversionRate,
  calculateQualified,
  calculateRemainingCount,
  classifyRiskLevel,
  sumDailyReportTotals,
} from './marketing-kpi-aggregation.service';

describe('MarketingKpiAggregationService', () => {
  describe('sumDailyReportTotals', () => {
    it('sums daily report rows', () => {
      const totals = sumDailyReportTotals([
        { contactedCount: 100, newMemberCount: 10, depositAmount: 5000, startedWorkCount: 2 },
        { contactedCount: 50, newMemberCount: 5, depositAmount: 3500, startedWorkCount: 1 },
      ]);
      expect(totals).toEqual({
        contactedCount: 150,
        newMemberCount: 15,
        depositAmount: 8500,
        startedWorkCount: 3,
      });
    });
  });

  describe('calculateConversionRate', () => {
    it('returns percent started over contacted', () => {
      expect(calculateConversionRate(2, 120)).toBe(1.67);
    });

    it('returns 0 when contacted is 0', () => {
      expect(calculateConversionRate(5, 0)).toBe(0);
    });
  });

  describe('calculateRemainingCount', () => {
    it('returns remaining to target', () => {
      expect(calculateRemainingCount(22, 24)).toBe(2);
    });
  });

  describe('calculateQualified', () => {
    it('qualifies at target', () => {
      expect(calculateQualified(24)).toBe(true);
    });

    it('exempt always qualifies', () => {
      expect(calculateQualified(0, 24, true)).toBe(true);
    });
  });

  describe('classifyRiskLevel', () => {
    it('classifies risk bands', () => {
      expect(classifyRiskLevel(10)).toBe('high_risk');
      expect(classifyRiskLevel(20)).toBe('at_risk');
      expect(classifyRiskLevel(30)).toBe('qualified');
    });
  });

  describe('buildKpiSnapshot', () => {
    it('builds employee KPI snapshot from totals', () => {
      const snapshot = buildKpiSnapshot({
        contactedCount: 1319,
        newMemberCount: 244,
        depositAmount: 252538,
        startedWorkCount: 22,
      });
      expect(snapshot.remainingCount).toBe(2);
      expect(snapshot.qualified).toBe(false);
      expect(snapshot.conversionRatePercent).toBe(1.67);
      expect(snapshot.riskLevel).toBe('at_risk');
    });
  });
});
