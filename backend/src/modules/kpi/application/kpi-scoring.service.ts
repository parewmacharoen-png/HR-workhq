// ============================================================================
// modules/kpi/application/kpi-scoring.service.ts
// KPI-001 — weighted totals and grade mapping
// ============================================================================

import { Injectable } from '@nestjs/common';

export interface WeightedScoreItem {
  score: number;
  weight: number;
}

export function computeWeightedTotal(items: WeightedScoreItem[]): number {
  if (!items.length) return 0;

  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight <= 0) {
    const avg = items.reduce((sum, item) => sum + item.score, 0) / items.length;
    return roundScore(avg);
  }

  const weighted = items.reduce((sum, item) => sum + item.score * item.weight, 0);
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
export class KpiScoringService {
  computeWeightedTotal(items: WeightedScoreItem[]): number {
    return computeWeightedTotal(items);
  }

  mapGrade(total: number): string {
    return mapGrade(total);
  }
}
