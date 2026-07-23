import { computeFinalScore, mapGrade } from './performance-score.service';

describe('PerformanceScoreService', () => {
  const weights = {
    kpiWeight: 0.4,
    leaderReviewWeight: 0.3,
    selfReviewWeight: 0.2,
    feedback360Weight: 0.1,
  };

  describe('computeFinalScore', () => {
    it('computes normalized weighted final score', () => {
      const finalScore = computeFinalScore(
        {
          kpiScore: 80,
          leaderReviewScore: 90,
          selfReviewScore: 70,
          feedback360Score: 85,
        },
        weights,
      );
      expect(finalScore).toBe(81.5);
    });

    it('normalizes weights when some components are missing', () => {
      const finalScore = computeFinalScore(
        { kpiScore: 80, leaderReviewScore: 90 },
        weights,
      );
      expect(finalScore).toBe(84.29);
    });

    it('returns null when no scores are available', () => {
      expect(computeFinalScore({}, weights)).toBeNull();
    });
  });

  describe('mapGrade', () => {
    it('maps grade A for 90+', () => {
      expect(mapGrade(90)).toBe('A');
    });

    it('maps grade B for 80-89', () => {
      expect(mapGrade(85)).toBe('B');
    });

    it('maps grade F below 60', () => {
      expect(mapGrade(55)).toBe('F');
    });
  });
});
