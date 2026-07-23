// ============================================================================
// Shared break overage deduction tiers (handbook).
// ============================================================================

import { AttendanceRulesSetting } from '../../modules/settings/domain/attendance-settings.types';

export type BreakPenaltyTier = 'none' | 'hourly' | 'half_day' | 'full_day' | 'absence';

export interface BreakDeductionResult {
  totalBreakMinutes: number;
  breakDeduction: number;
  tier: BreakPenaltyTier;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function roundedOverageHours(overageMinutes: number): number {
  if (overageMinutes <= 0) return 0;
  return Math.ceil(overageMinutes / 60);
}

export function computeBreakDeduction(
  totalBreakMinutes: number,
  rules: AttendanceRulesSetting,
  hourlyRate: number,
): BreakDeductionResult {
  const allowed = rules.breakMinutes;
  if (totalBreakMinutes <= allowed || hourlyRate <= 0) {
    return { totalBreakMinutes, breakDeduction: 0, tier: 'none' };
  }

  const multiplier = rules.latePenaltyMultiplier;
  const dailyWage = hourlyRate * 8;
  const totalHours = totalBreakMinutes / 60;

  if (totalHours > rules.fullDayAbsenceThresholdHours) {
    return { totalBreakMinutes, breakDeduction: 0, tier: 'absence' };
  }
  if (totalHours > rules.halfDayAbsenceThresholdHours) {
    return {
      totalBreakMinutes,
      breakDeduction: roundMoney(dailyWage * multiplier),
      tier: 'full_day',
    };
  }
  if (totalHours > rules.breakOveragePenaltyThresholdHours) {
    return {
      totalBreakMinutes,
      breakDeduction: roundMoney((dailyWage / 2) * multiplier),
      tier: 'half_day',
    };
  }

  const overageMinutes = totalBreakMinutes - allowed;
  const roundedHours = roundedOverageHours(overageMinutes);
  return {
    totalBreakMinutes,
    breakDeduction: roundMoney(roundedHours * multiplier * hourlyRate),
    tier: 'hourly',
  };
}
