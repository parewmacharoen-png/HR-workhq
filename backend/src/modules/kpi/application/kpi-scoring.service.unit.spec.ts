import { computeWeightedTotal, mapGrade } from './kpi-scoring.service';

describe('KpiScoringService', () => {
  describe('computeWeightedTotal', () => {
    it('computes weighted average from scores and weights', () => {
      const total = computeWeightedTotal([
        { score: 80, weight: 0.5 },
        { score: 100, weight: 0.5 },
      ]);
      expect(total).toBe(90);
    });

    it('falls back to simple average when total weight is zero', () => {
      const total = computeWeightedTotal([
        { score: 60, weight: 0 },
        { score: 80, weight: 0 },
      ]);
      expect(total).toBe(70);
    });

    it('returns zero for empty items', () => {
      expect(computeWeightedTotal([])).toBe(0);
    });
  });

  describe('mapGrade', () => {
    it('maps grade A for 90-100', () => {
      expect(mapGrade(90)).toBe('A');
      expect(mapGrade(100)).toBe('A');
    });

    it('maps grade B for 80-89', () => {
      expect(mapGrade(80)).toBe('B');
      expect(mapGrade(89)).toBe('B');
    });

    it('maps grade C for 70-79', () => {
      expect(mapGrade(70)).toBe('C');
    });

    it('maps grade D for 60-69', () => {
      expect(mapGrade(60)).toBe('D');
    });

    it('maps grade F below 60', () => {
      expect(mapGrade(59)).toBe('F');
    });
  });
});
