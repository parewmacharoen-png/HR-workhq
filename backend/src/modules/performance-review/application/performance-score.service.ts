// ============================================================================
// modules/performance-review/application/performance-score.service.ts
// KPI-003 — final score computation and grade mapping
// ============================================================================

import { Injectable } from '@nestjs/common';

export interface PerformanceScoreWeights {
  kpiWeight: number;
  leaderReviewWeight: number;
  selfReviewWeight: number;
  feedback360Weight: number;
}

export interface PerformanceScoreInputs {
  kpiScore?: number | null;
  leaderReviewScore?: number | null;
  selfReviewScore?: number | null;
  feedback360Score?: number | null;
}

export function computeFinalScore(
  scores: PerformanceScoreInputs,
  weights: PerformanceScoreWeights,
): number | null {
  const components = [
    { score: scores.kpiScore, weight: weights.kpiWeight },
    { score: scores.leaderReviewScore, weight: weights.leaderReviewWeight },
    { score: scores.selfReviewScore, weight: weights.selfReviewWeight },
    { score: scores.feedback360Score, weight: weights.feedback360Weight },
  ].filter((item) => item.score != null && item.weight > 0);

  if (!components.length) return null;

  const totalWeight = components.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) return null;

  const weighted = components.reduce(
    (sum, item) => sum + item.score! * item.weight,
    0,
  );

  return roundScore(weighted / totalWeight);
}

export function mapGrade(total: number): string {
  if (total >= 90) return 'A';
  if (total >= 80) return 'B';
  if (total >= 70) return 'C';
  if (total >= 60) return 'D';
  return 'F';
}

function roundScore(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class PerformanceScoreService {
  computeFinalScore(
    scores: PerformanceScoreInputs,
    weights: PerformanceScoreWeights,
  ): number | null {
    return computeFinalScore(scores, weights);
  }

  mapGrade(total: number): string {
    return mapGrade(total);
  }
}
