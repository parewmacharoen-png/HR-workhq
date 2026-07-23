// ============================================================================
// modules/performance/domain/services/scoring.service.ts
// Pure computation of:
//   * Weighted total score from dimension scores × weights
//   * Grade (A/B/C/D/F) from total score
//   * Promotion readiness recommendation from grade + tenure + probation status
//   * Salary review action recommendation
// All thresholds are injectable (configurable per spec). Formula versioning is
// handled by the application layer selecting the right ScoringConfig as-of the
// cycle date via the formula_versions table.
// ============================================================================

import { WeightSumError, ScoreOutOfRangeError } from '../errors/performance.errors';

export type PerformanceDimension =
  'attendance' | 'recruitment' | 'discipline' | 'manager_review' | 'owner_review';

export type Grade = 'A' | 'B' | 'C' | 'D' | 'F';
export type PromotionReadiness = 'ready' | 'ready_with_conditions' | 'not_ready' | 'needs_review';
export type SalaryReviewAction = 'increase' | 'maintain' | 'decrease' | 'freeze' | 'probation_extension';

export interface DimensionWeight {
  dimension: PerformanceDimension;
  weight: number;   // 0–1, all weights must sum to 1.0
}

export interface DimensionScore {
  dimension: PerformanceDimension;
  rawScore: number; // 0–100
}

export interface ScoredDimension extends DimensionScore {
  weight: number;
  weightedScore: number;
}

export interface ScoringConfig {
  /** Grade thresholds (lower bound inclusive). Default: A≥90 B≥75 C≥60 D≥50 F<50 */
  gradeThresholds: { A: number; B: number; C: number; D: number };
  /** Minimum consecutive months in current role before promotion readiness is 'ready'. */
  minMonthsForPromotion: number;
  /** Salary increase % suggested for grade A. */
  gradeAIncreasePct: number;
  /** Salary increase % suggested for grade B. */
  gradeBIncreasePct: number;
}

export const DEFAULT_SCORING_CONFIG: ScoringConfig = {
  gradeThresholds: { A: 90, B: 75, C: 60, D: 50 },
  minMonthsForPromotion: 12,
  gradeAIncreasePct: 10,
  gradeBIncreasePct: 5,
};

export interface EvaluationResult {
  scores: ScoredDimension[];
  totalScore: number;
  grade: Grade;
  promotionReadiness: PromotionReadiness;
  salaryReviewAction: SalaryReviewAction;
  salaryIncreasePct: number | null;
}

export class ScoringService {
  constructor(private readonly config: ScoringConfig = DEFAULT_SCORING_CONFIG) {}

  /** Validate weights: sum must equal 1.0 within floating-point tolerance. */
  validateWeights(weights: DimensionWeight[]): void {
    const sum = weights.reduce((acc, w) => acc + w.weight, 0);
    if (Math.abs(sum - 1.0) > 0.0001) throw new WeightSumError(sum);
  }

  /** Compute weighted scores and aggregate total. */
  computeScores(
    rawScores: DimensionScore[],
    weights: DimensionWeight[],
  ): { scored: ScoredDimension[]; total: number } {
    this.validateWeights(weights);
    const weightMap = new Map(weights.map(w => [w.dimension, w.weight]));

    const scored: ScoredDimension[] = rawScores.map(ds => {
      if (ds.rawScore < 0 || ds.rawScore > 100) throw new ScoreOutOfRangeError(ds.dimension);
      const weight = weightMap.get(ds.dimension) ?? 0;
      return { ...ds, weight, weightedScore: this.r4(ds.rawScore * weight) };
    });

    const total = this.r2(scored.reduce((acc, s) => acc + s.weightedScore, 0));
    return { scored, total };
  }

  /** Map a total score (0–100) to a letter grade. */
  toGrade(totalScore: number): Grade {
    const t = this.config.gradeThresholds;
    if (totalScore >= t.A) return 'A';
    if (totalScore >= t.B) return 'B';
    if (totalScore >= t.C) return 'C';
    if (totalScore >= t.D) return 'D';
    return 'F';
  }

  /** Determine promotion readiness from grade, tenure, and probation status. */
  toPromotionReadiness(input: {
    grade: Grade;
    tenureMonths: number;
    isOnProbation: boolean;
  }): PromotionReadiness {
    const { grade, tenureMonths, isOnProbation } = input;

    if (isOnProbation) return 'not_ready';
    if (grade === 'F' || grade === 'D') return 'not_ready';
    if (grade === 'C') return 'needs_review';

    const hasMinTenure = tenureMonths >= this.config.minMonthsForPromotion;
    if (grade === 'A') return hasMinTenure ? 'ready' : 'ready_with_conditions';
    if (grade === 'B') return hasMinTenure ? 'ready_with_conditions' : 'needs_review';

    return 'needs_review';
  }

  /** Recommend a salary action from grade and probation status. */
  toSalaryReviewAction(input: {
    grade: Grade;
    isOnProbation: boolean;
  }): { action: SalaryReviewAction; increasePct: number | null } {
    const { grade, isOnProbation } = input;

    if (isOnProbation && (grade === 'D' || grade === 'F')) {
      return { action: 'probation_extension', increasePct: null };
    }
    switch (grade) {
      case 'A': return { action: 'increase', increasePct: this.config.gradeAIncreasePct };
      case 'B': return { action: 'increase', increasePct: this.config.gradeBIncreasePct };
      case 'C': return { action: 'maintain', increasePct: null };
      case 'D': return { action: 'freeze', increasePct: null };
      case 'F': return { action: 'decrease', increasePct: null };
    }
  }

  /** Full evaluation roll-up from raw scores + weights + context. */
  evaluate(input: {
    rawScores: DimensionScore[];
    weights: DimensionWeight[];
    tenureMonths: number;
    isOnProbation: boolean;
  }): EvaluationResult {
    const { scored, total } = this.computeScores(input.rawScores, input.weights);
    const grade = this.toGrade(total);
    const promotionReadiness = this.toPromotionReadiness({
      grade, tenureMonths: input.tenureMonths, isOnProbation: input.isOnProbation,
    });
    const { action: salaryReviewAction, increasePct: salaryIncreasePct } =
      this.toSalaryReviewAction({ grade, isOnProbation: input.isOnProbation });

    return { scores: scored, totalScore: total, grade, promotionReadiness, salaryReviewAction, salaryIncreasePct };
  }

  private r2(n: number): number { return Math.round(n * 100) / 100; }
  private r4(n: number): number { return Math.round(n * 10000) / 10000; }
}
