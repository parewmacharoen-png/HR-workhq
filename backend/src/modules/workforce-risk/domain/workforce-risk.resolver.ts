// ============================================================================
// modules/workforce-risk/domain/workforce-risk.resolver.ts
// ============================================================================

import type { WorkforceRiskLevel, WorkforceRiskRecommendation } from './workforce-risk.types';

export function resolveRiskLevel(
  availableCount: number,
  requiredMinimum: number,
): { level: WorkforceRiskLevel; shortage: number } {
  const shortage = Math.max(0, requiredMinimum - availableCount);
  if (availableCount > requiredMinimum) {
    return { level: 'GREEN', shortage: 0 };
  }
  if (availableCount === requiredMinimum) {
    return { level: 'YELLOW', shortage: 0 };
  }
  if (shortage === 1) {
    return { level: 'ORANGE', shortage: 1 };
  }
  return { level: 'RED', shortage };
}

export function worstRiskLevel(levels: WorkforceRiskLevel[]): WorkforceRiskLevel {
  const order: WorkforceRiskLevel[] = ['GREEN', 'YELLOW', 'ORANGE', 'RED'];
  let worst: WorkforceRiskLevel = 'GREEN';
  for (const level of levels) {
    if (order.indexOf(level) > order.indexOf(worst)) {
      worst = level;
    }
  }
  return worst;
}

export function buildRecommendations(
  shortage: number,
  reasons: string[],
): WorkforceRiskRecommendation[] {
  if (shortage <= 0) return [];
  const recs: WorkforceRiskRecommendation[] = ['approve_ot', 'call_standby_employee'];
  if (shortage >= 1) {
    recs.push('move_employee_from_team');
  }
  if (reasons.some((r) => r.includes('วันหยุดประจำเดือน'))) {
    recs.push('reschedule_monthly_off');
  }
  if (shortage >= 2) {
    recs.push('alert_owner');
  }
  return [...new Set(recs)];
}
