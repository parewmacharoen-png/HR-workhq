// ============================================================================
// marketing-kpi-risk.service.unit.spec.ts
// ============================================================================

import {
  classifyMarketingKpiRisk,
  isMarketingKpiQualified,
  remainingKpiCount,
} from './marketing-kpi-risk.service';

describe('Marketing KPI risk service', () => {
  describe('remainingKpiCount', () => {
    it('returns 0 when at target', () => {
      expect(remainingKpiCount(24, 24)).toBe(0);
    });

    it('returns remaining to target', () => {
      expect(remainingKpiCount(17, 24)).toBe(7);
    });

    it('never returns negative', () => {
      expect(remainingKpiCount(30, 24)).toBe(0);
    });
  });

  describe('isMarketingKpiQualified', () => {
    it('qualifies at 24 started work', () => {
      expect(isMarketingKpiQualified(24)).toBe(true);
    });

    it('does not qualify below 24', () => {
      expect(isMarketingKpiQualified(23)).toBe(false);
    });

    it('big leader exempt always qualifies', () => {
      expect(isMarketingKpiQualified(0, 24, true)).toBe(true);
    });
  });

  describe('classifyMarketingKpiRisk', () => {
    it('0-15 is high risk', () => {
      expect(classifyMarketingKpiRisk(0)).toBe('high_risk');
      expect(classifyMarketingKpiRisk(15)).toBe('high_risk');
    });

    it('16-23 is at risk', () => {
      expect(classifyMarketingKpiRisk(16)).toBe('at_risk');
      expect(classifyMarketingKpiRisk(23)).toBe('at_risk');
    });

    it('24+ is qualified', () => {
      expect(classifyMarketingKpiRisk(24)).toBe('qualified');
      expect(classifyMarketingKpiRisk(41)).toBe('qualified');
    });
  });
});
