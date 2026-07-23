// ============================================================================
// modules/workforce-risk/domain/workforce-risk.resolver.unit.spec.ts
// ============================================================================

import { buildRecommendations, resolveRiskLevel, worstRiskLevel } from './workforce-risk.resolver';

describe('resolveRiskLevel', () => {
  it('returns GREEN when above minimum', () => {
    expect(resolveRiskLevel(5, 3)).toEqual({ level: 'GREEN', shortage: 0 });
  });

  it('returns YELLOW when equals minimum', () => {
    expect(resolveRiskLevel(3, 3)).toEqual({ level: 'YELLOW', shortage: 0 });
  });

  it('returns ORANGE when below minimum by 1', () => {
    expect(resolveRiskLevel(2, 3)).toEqual({ level: 'ORANGE', shortage: 1 });
  });

  it('returns RED when below minimum by 2+', () => {
    expect(resolveRiskLevel(1, 4)).toEqual({ level: 'RED', shortage: 3 });
  });
});

describe('worstRiskLevel', () => {
  it('picks highest severity', () => {
    expect(worstRiskLevel(['GREEN', 'YELLOW', 'ORANGE'])).toBe('ORANGE');
    expect(worstRiskLevel(['GREEN', 'RED'])).toBe('RED');
  });
});

describe('buildRecommendations', () => {
  it('returns recommendations when shortage exists', () => {
    const recs = buildRecommendations(2, ['วันหยุดประจำเดือน']);
    expect(recs).toContain('approve_ot');
    expect(recs).toContain('reschedule_monthly_off');
    expect(recs).toContain('alert_owner');
  });

  it('returns empty when no shortage', () => {
    expect(buildRecommendations(0, [])).toEqual([]);
  });
});
