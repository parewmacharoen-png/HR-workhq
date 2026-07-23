// ============================================================================
// modules/performance/domain/services/scoring.service.unit.spec.ts
// ============================================================================

import { ScoringService, ScoringConfig, DimensionWeight, DimensionScore, DEFAULT_SCORING_CONFIG } from './scoring.service';
import { WeightSumError, ScoreOutOfRangeError } from '../errors/performance.errors';

// ── Fixtures ─────────────────────────────────────────────────────────────────

/** Five dimensions summing to 1.0 with equal weights. */
const EQUAL_WEIGHTS: DimensionWeight[] = [
  { dimension: 'attendance',     weight: 0.2 },
  { dimension: 'recruitment',    weight: 0.2 },
  { dimension: 'discipline',     weight: 0.2 },
  { dimension: 'manager_review', weight: 0.2 },
  { dimension: 'owner_review',   weight: 0.2 },
];

/** Real-world unequal weights used in the business. */
const UNEQUAL_WEIGHTS: DimensionWeight[] = [
  { dimension: 'attendance',     weight: 0.15 },
  { dimension: 'recruitment',    weight: 0.35 },
  { dimension: 'discipline',     weight: 0.10 },
  { dimension: 'manager_review', weight: 0.25 },
  { dimension: 'owner_review',   weight: 0.15 },
];

function allScores(value: number): DimensionScore[] {
  return EQUAL_WEIGHTS.map(w => ({ dimension: w.dimension, rawScore: value }));
}

// ── ScoringService.validateWeights ───────────────────────────────────────────

describe('ScoringService.validateWeights', () => {
  const svc = new ScoringService();

  it('accepts weights that sum to exactly 1.0', () => {
    expect(() => svc.validateWeights(EQUAL_WEIGHTS)).not.toThrow();
  });

  it('accepts weights that sum within floating-point tolerance (0.9999…)', () => {
    // Floating-point arithmetic can produce 0.99999... for real sums
    const weights: DimensionWeight[] = [
      { dimension: 'attendance',     weight: 0.1 },
      { dimension: 'recruitment',    weight: 0.1 },
      { dimension: 'discipline',     weight: 0.1 },
      { dimension: 'manager_review', weight: 0.35 },
      { dimension: 'owner_review',   weight: 0.35 },
    ];
    expect(() => svc.validateWeights(weights)).not.toThrow();
  });

  it('accepts unequal weights that correctly sum to 1.0', () => {
    expect(() => svc.validateWeights(UNEQUAL_WEIGHTS)).not.toThrow();
  });

  it('throws WeightSumError when weights sum to 0.9 (under)', () => {
    const under: DimensionWeight[] = [
      { dimension: 'attendance',     weight: 0.2 },
      { dimension: 'recruitment',    weight: 0.2 },
      { dimension: 'discipline',     weight: 0.1 },
      { dimension: 'manager_review', weight: 0.2 },
      { dimension: 'owner_review',   weight: 0.2 },
    ];
    expect(() => svc.validateWeights(under)).toThrow(WeightSumError);
  });

  it('throws WeightSumError when weights sum to 1.1 (over)', () => {
    const over: DimensionWeight[] = EQUAL_WEIGHTS.map(w => ({ ...w, weight: 0.22 }));
    expect(() => svc.validateWeights(over)).toThrow(WeightSumError);
  });

  it('throws WeightSumError on empty weights array (sum = 0)', () => {
    expect(() => svc.validateWeights([])).toThrow(WeightSumError);
  });

  it('WeightSumError message contains the actual sum', () => {
    const under: DimensionWeight[] = [{ dimension: 'attendance', weight: 0.5 }];
    expect(() => svc.validateWeights(under)).toThrow(/0\.5000/);
  });

  it('accepts a single weight of exactly 1.0', () => {
    const single: DimensionWeight[] = [{ dimension: 'attendance', weight: 1.0 }];
    expect(() => svc.validateWeights(single)).not.toThrow();
  });
});

// ── ScoringService.computeScores ─────────────────────────────────────────────

describe('ScoringService.computeScores', () => {
  const svc = new ScoringService();

  it('returns correct weighted scores for all-100 input', () => {
    const { scored, total } = svc.computeScores(allScores(100), EQUAL_WEIGHTS);
    expect(total).toBe(100);
    scored.forEach(s => {
      expect(s.rawScore).toBe(100);
      expect(s.weight).toBe(0.2);
      expect(s.weightedScore).toBe(20);
    });
  });

  it('returns correct total for all-0 input', () => {
    const { total } = svc.computeScores(allScores(0), EQUAL_WEIGHTS);
    expect(total).toBe(0);
  });

  it('correctly computes unequal weighted scores', () => {
    const scores: DimensionScore[] = [
      { dimension: 'attendance',     rawScore: 80 },
      { dimension: 'recruitment',    rawScore: 90 },
      { dimension: 'discipline',     rawScore: 70 },
      { dimension: 'manager_review', rawScore: 85 },
      { dimension: 'owner_review',   rawScore: 75 },
    ];
    const { total } = svc.computeScores(scores, UNEQUAL_WEIGHTS);
    // 80*0.15 + 90*0.35 + 70*0.10 + 85*0.25 + 75*0.15
    // = 12 + 31.5 + 7 + 21.25 + 11.25 = 83
    expect(total).toBe(83);
  });

  it('rounds individual weighted scores to 4 decimal places', () => {
    const scores: DimensionScore[] = [{ dimension: 'attendance', rawScore: 33 }];
    const weights: DimensionWeight[] = [{ dimension: 'attendance', weight: 1.0 }];
    const { scored } = svc.computeScores(scores, weights);
    // 33 * 1.0 = 33 exactly
    expect(scored[0]!.weightedScore).toBe(33);
  });

  it('rounds total to 2 decimal places', () => {
    // 1/3 * 100 = 33.333... should round to 33.33
    const scores: DimensionScore[] = [{ dimension: 'attendance', rawScore: 100 }];
    const weights: DimensionWeight[] = [{ dimension: 'attendance', weight: 1 / 3 }];
    // Won't reach this validation (sum ≠ 1) but tests the rounding math via direct math
    // Instead test with known repeating decimal
    // 33.33... * weight should produce rounded output
    const raw: DimensionScore[] = [{ dimension: 'attendance', rawScore: 100 / 3 }];
    const w: DimensionWeight[]  = [{ dimension: 'attendance', weight: 1 }];
    const { total } = svc.computeScores(raw, w);
    expect(Number.isFinite(total)).toBe(true);
    expect(total.toString().split('.')[1]?.length ?? 0).toBeLessThanOrEqual(2);
  });

  it('throws ScoreOutOfRangeError when rawScore > 100', () => {
    const scores: DimensionScore[] = [{ dimension: 'attendance', rawScore: 101 }];
    const weights: DimensionWeight[] = [{ dimension: 'attendance', weight: 1.0 }];
    expect(() => svc.computeScores(scores, weights)).toThrow(ScoreOutOfRangeError);
  });

  it('throws ScoreOutOfRangeError when rawScore < 0', () => {
    const scores: DimensionScore[] = [{ dimension: 'attendance', rawScore: -1 }];
    const weights: DimensionWeight[] = [{ dimension: 'attendance', weight: 1.0 }];
    expect(() => svc.computeScores(scores, weights)).toThrow(ScoreOutOfRangeError);
  });

  it('ScoreOutOfRangeError message names the dimension', () => {
    const scores: DimensionScore[] = [{ dimension: 'manager_review', rawScore: 150 }];
    const weights: DimensionWeight[] = [{ dimension: 'manager_review', weight: 1.0 }];
    expect(() => svc.computeScores(scores, weights)).toThrow(/manager_review/);
  });

  it('accepts boundary scores of exactly 0 and 100', () => {
    const scores: DimensionScore[] = [
      { dimension: 'attendance',     rawScore: 0 },
      { dimension: 'recruitment',    rawScore: 100 },
      { dimension: 'discipline',     rawScore: 50 },
      { dimension: 'manager_review', rawScore: 0 },
      { dimension: 'owner_review',   rawScore: 100 },
    ];
    expect(() => svc.computeScores(scores, EQUAL_WEIGHTS)).not.toThrow();
  });

  it('assigns weight 0 to a dimension not in the weight map', () => {
    const scores: DimensionScore[] = [{ dimension: 'attendance', rawScore: 80 }];
    const weights: DimensionWeight[] = [{ dimension: 'recruitment', weight: 1.0 }];
    const { scored } = svc.computeScores(scores, weights);
    // attendance not in weight map → weight = 0
    expect(scored[0]!.weight).toBe(0);
    expect(scored[0]!.weightedScore).toBe(0);
  });

  it('propagates rawScore and dimension unchanged', () => {
    const { scored } = svc.computeScores(allScores(75), EQUAL_WEIGHTS);
    scored.forEach((s, i) => {
      expect(s.dimension).toBe(EQUAL_WEIGHTS[i]!.dimension);
      expect(s.rawScore).toBe(75);
    });
  });
});

// ── ScoringService.toGrade ───────────────────────────────────────────────────

describe('ScoringService.toGrade (default thresholds: A≥90, B≥75, C≥60, D≥50)', () => {
  const svc = new ScoringService();

  // ── Grade A ──
  it('returns A for score 100', () => expect(svc.toGrade(100)).toBe('A'));
  it('returns A for score 90 (boundary)', () => expect(svc.toGrade(90)).toBe('A'));
  it('returns A for score 91', () => expect(svc.toGrade(91)).toBe('A'));

  // ── Grade B ──
  it('returns B for score 89.99 (just below A)', () => expect(svc.toGrade(89.99)).toBe('B'));
  it('returns B for score 75 (boundary)', () => expect(svc.toGrade(75)).toBe('B'));
  it('returns B for score 80', () => expect(svc.toGrade(80)).toBe('B'));

  // ── Grade C ──
  it('returns C for score 74.99', () => expect(svc.toGrade(74.99)).toBe('C'));
  it('returns C for score 60 (boundary)', () => expect(svc.toGrade(60)).toBe('C'));
  it('returns C for score 65', () => expect(svc.toGrade(65)).toBe('C'));

  // ── Grade D ──
  it('returns D for score 59.99', () => expect(svc.toGrade(59.99)).toBe('D'));
  it('returns D for score 50 (boundary)', () => expect(svc.toGrade(50)).toBe('D'));
  it('returns D for score 55', () => expect(svc.toGrade(55)).toBe('D'));

  // ── Grade F ──
  it('returns F for score 49.99', () => expect(svc.toGrade(49.99)).toBe('F'));
  it('returns F for score 0', () => expect(svc.toGrade(0)).toBe('F'));
  it('returns F for score 1', () => expect(svc.toGrade(1)).toBe('F'));

  it('uses custom thresholds when config is injected', () => {
    const custom: ScoringConfig = {
      ...DEFAULT_SCORING_CONFIG,
      gradeThresholds: { A: 95, B: 80, C: 65, D: 55 },
    };
    const svcCustom = new ScoringService(custom);
    expect(svcCustom.toGrade(94)).toBe('B');  // below custom A threshold
    expect(svcCustom.toGrade(95)).toBe('A');  // meets custom A threshold
    expect(svcCustom.toGrade(54)).toBe('F');  // below custom D threshold
  });
});

// ── ScoringService.toPromotionReadiness ──────────────────────────────────────

describe('ScoringService.toPromotionReadiness', () => {
  const svc = new ScoringService(); // minMonthsForPromotion = 12

  describe('probation override — always not_ready on probation', () => {
    it('returns not_ready for grade A on probation', () => {
      expect(svc.toPromotionReadiness({ grade: 'A', tenureMonths: 24, isOnProbation: true })).toBe('not_ready');
    });
    it('returns not_ready for grade B on probation', () => {
      expect(svc.toPromotionReadiness({ grade: 'B', tenureMonths: 24, isOnProbation: true })).toBe('not_ready');
    });
    it('returns not_ready for grade C on probation', () => {
      expect(svc.toPromotionReadiness({ grade: 'C', tenureMonths: 24, isOnProbation: true })).toBe('not_ready');
    });
  });

  describe('grade F and D — always not_ready', () => {
    it('returns not_ready for grade F regardless of tenure', () => {
      expect(svc.toPromotionReadiness({ grade: 'F', tenureMonths: 36, isOnProbation: false })).toBe('not_ready');
    });
    it('returns not_ready for grade D regardless of tenure', () => {
      expect(svc.toPromotionReadiness({ grade: 'D', tenureMonths: 36, isOnProbation: false })).toBe('not_ready');
    });
  });

  describe('grade C — always needs_review', () => {
    it('returns needs_review for grade C with long tenure', () => {
      expect(svc.toPromotionReadiness({ grade: 'C', tenureMonths: 24, isOnProbation: false })).toBe('needs_review');
    });
    it('returns needs_review for grade C with short tenure', () => {
      expect(svc.toPromotionReadiness({ grade: 'C', tenureMonths: 3, isOnProbation: false })).toBe('needs_review');
    });
  });

  describe('grade A', () => {
    it('returns ready when tenure >= 12 months', () => {
      expect(svc.toPromotionReadiness({ grade: 'A', tenureMonths: 12, isOnProbation: false })).toBe('ready');
    });
    it('returns ready when tenure is 24 months', () => {
      expect(svc.toPromotionReadiness({ grade: 'A', tenureMonths: 24, isOnProbation: false })).toBe('ready');
    });
    it('returns ready_with_conditions when tenure < 12 months', () => {
      expect(svc.toPromotionReadiness({ grade: 'A', tenureMonths: 11, isOnProbation: false })).toBe('ready_with_conditions');
    });
    it('returns ready_with_conditions at tenure = 0', () => {
      expect(svc.toPromotionReadiness({ grade: 'A', tenureMonths: 0, isOnProbation: false })).toBe('ready_with_conditions');
    });
  });

  describe('grade B', () => {
    it('returns ready_with_conditions when tenure >= 12 months', () => {
      expect(svc.toPromotionReadiness({ grade: 'B', tenureMonths: 12, isOnProbation: false })).toBe('ready_with_conditions');
    });
    it('returns needs_review when tenure < 12 months', () => {
      expect(svc.toPromotionReadiness({ grade: 'B', tenureMonths: 6, isOnProbation: false })).toBe('needs_review');
    });
  });

  it('respects custom minMonthsForPromotion', () => {
    const custom: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, minMonthsForPromotion: 6 };
    const svcCustom = new ScoringService(custom);
    expect(svcCustom.toPromotionReadiness({ grade: 'A', tenureMonths: 6, isOnProbation: false })).toBe('ready');
    expect(svcCustom.toPromotionReadiness({ grade: 'A', tenureMonths: 5, isOnProbation: false })).toBe('ready_with_conditions');
  });

  it('uses tenure boundary exactly at 12 months', () => {
    // 12 is inclusive → ready
    expect(svc.toPromotionReadiness({ grade: 'A', tenureMonths: 12, isOnProbation: false })).toBe('ready');
    // 11 is below → ready_with_conditions
    expect(svc.toPromotionReadiness({ grade: 'A', tenureMonths: 11, isOnProbation: false })).toBe('ready_with_conditions');
  });
});

// ── ScoringService.toSalaryReviewAction ──────────────────────────────────────

describe('ScoringService.toSalaryReviewAction', () => {
  const svc = new ScoringService(); // gradeAIncreasePct=10, gradeBIncreasePct=5

  it('grade A → increase at 10%', () => {
    const { action, increasePct } = svc.toSalaryReviewAction({ grade: 'A', isOnProbation: false });
    expect(action).toBe('increase');
    expect(increasePct).toBe(10);
  });

  it('grade B → increase at 5%', () => {
    const { action, increasePct } = svc.toSalaryReviewAction({ grade: 'B', isOnProbation: false });
    expect(action).toBe('increase');
    expect(increasePct).toBe(5);
  });

  it('grade C → maintain with no increase', () => {
    const { action, increasePct } = svc.toSalaryReviewAction({ grade: 'C', isOnProbation: false });
    expect(action).toBe('maintain');
    expect(increasePct).toBeNull();
  });

  it('grade D → freeze with no increase', () => {
    const { action, increasePct } = svc.toSalaryReviewAction({ grade: 'D', isOnProbation: false });
    expect(action).toBe('freeze');
    expect(increasePct).toBeNull();
  });

  it('grade F → decrease with no increase', () => {
    const { action, increasePct } = svc.toSalaryReviewAction({ grade: 'F', isOnProbation: false });
    expect(action).toBe('decrease');
    expect(increasePct).toBeNull();
  });

  describe('probation extension rule', () => {
    it('grade D on probation → probation_extension', () => {
      const { action } = svc.toSalaryReviewAction({ grade: 'D', isOnProbation: true });
      expect(action).toBe('probation_extension');
    });

    it('grade F on probation → probation_extension', () => {
      const { action } = svc.toSalaryReviewAction({ grade: 'F', isOnProbation: true });
      expect(action).toBe('probation_extension');
    });

    it('grade A on probation → still increase (probation extension only for D/F)', () => {
      const { action } = svc.toSalaryReviewAction({ grade: 'A', isOnProbation: true });
      expect(action).toBe('increase');
    });

    it('grade C on probation → still maintain (not probation_extension)', () => {
      const { action } = svc.toSalaryReviewAction({ grade: 'C', isOnProbation: true });
      expect(action).toBe('maintain');
    });
  });

  it('uses custom increase percentages from config', () => {
    const custom: ScoringConfig = { ...DEFAULT_SCORING_CONFIG, gradeAIncreasePct: 15, gradeBIncreasePct: 7 };
    const svcCustom = new ScoringService(custom);
    expect(svcCustom.toSalaryReviewAction({ grade: 'A', isOnProbation: false }).increasePct).toBe(15);
    expect(svcCustom.toSalaryReviewAction({ grade: 'B', isOnProbation: false }).increasePct).toBe(7);
  });
});

// ── ScoringService.evaluate (full roll-up) ───────────────────────────────────

describe('ScoringService.evaluate', () => {
  const svc = new ScoringService();

  it('produces grade A, ready promotion, increase for all-100 scores with 12-month tenure', () => {
    const result = svc.evaluate({
      rawScores: allScores(100),
      weights: EQUAL_WEIGHTS,
      tenureMonths: 12,
      isOnProbation: false,
    });
    expect(result.totalScore).toBe(100);
    expect(result.grade).toBe('A');
    expect(result.promotionReadiness).toBe('ready');
    expect(result.salaryReviewAction).toBe('increase');
    expect(result.salaryIncreasePct).toBe(10);
  });

  it('produces grade F, not_ready, decrease for all-0 scores', () => {
    const result = svc.evaluate({
      rawScores: allScores(0),
      weights: EQUAL_WEIGHTS,
      tenureMonths: 24,
      isOnProbation: false,
    });
    expect(result.totalScore).toBe(0);
    expect(result.grade).toBe('F');
    expect(result.promotionReadiness).toBe('not_ready');
    expect(result.salaryReviewAction).toBe('decrease');
  });

  it('returns all five scored dimensions', () => {
    const result = svc.evaluate({
      rawScores: allScores(80),
      weights: EQUAL_WEIGHTS,
      tenureMonths: 6,
      isOnProbation: false,
    });
    expect(result.scores).toHaveLength(5);
  });

  it('propagates isOnProbation=true → not_ready even with grade A', () => {
    const result = svc.evaluate({
      rawScores: allScores(95),
      weights: EQUAL_WEIGHTS,
      tenureMonths: 24,
      isOnProbation: true,
    });
    expect(result.grade).toBe('A');
    expect(result.promotionReadiness).toBe('not_ready');
  });

  it('correctly handles exact grade boundary at 75 (grade B)', () => {
    // 75 * 1.0 = 75 → grade B
    const result = svc.evaluate({
      rawScores: [{ dimension: 'attendance', rawScore: 75 }],
      weights: [{ dimension: 'attendance', weight: 1.0 }],
      tenureMonths: 15,
      isOnProbation: false,
    });
    expect(result.grade).toBe('B');
    expect(result.salaryReviewAction).toBe('increase');
    expect(result.salaryIncreasePct).toBe(5);
  });

  it('throws WeightSumError when weights do not sum to 1', () => {
    expect(() => svc.evaluate({
      rawScores: allScores(80),
      weights: [{ dimension: 'attendance', weight: 0.5 }],
      tenureMonths: 12,
      isOnProbation: false,
    })).toThrow(WeightSumError);
  });

  it('throws ScoreOutOfRangeError on invalid raw score', () => {
    const badScores: DimensionScore[] = [
      { dimension: 'attendance',     rawScore: 200 },
      { dimension: 'recruitment',    rawScore: 80 },
      { dimension: 'discipline',     rawScore: 80 },
      { dimension: 'manager_review', rawScore: 80 },
      { dimension: 'owner_review',   rawScore: 80 },
    ];
    expect(() => svc.evaluate({
      rawScores: badScores,
      weights: EQUAL_WEIGHTS,
      tenureMonths: 12,
      isOnProbation: false,
    })).toThrow(ScoreOutOfRangeError);
  });

  it('salaryIncreasePct is null for non-increase actions', () => {
    const result = svc.evaluate({
      rawScores: allScores(30),   // → grade F
      weights: EQUAL_WEIGHTS,
      tenureMonths: 24,
      isOnProbation: false,
    });
    expect(result.salaryIncreasePct).toBeNull();
  });
});
