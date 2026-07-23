// ============================================================================
// modules/payroll/domain/services/leave-bonus.service.ts
// Monthly unused off-day bonus for payroll.
//
// Normal rule:
//   eligibleBonusDays = max(0, min(maxEligibleDays, monthlyOffDays - usedOffDays))
//   leaveBonus = eligibleBonusDays * ratePerDay
//
// Owner override (staffing / business emergency): drop the maxEligibleDays cap.
// ============================================================================

import { LeaveRulesSetting } from '../../../settings/domain/leave-settings.types';
import { isOffDayLeaveType } from '../../../leave/domain/services/leave-type-classification';

export { isOffDayLeaveType };

export interface LeaveBonusParams {
  monthlyOffDays: number;
  ratePerDay: number;
  maxEligibleDays: number;
}

export interface LeaveBonusInput {
  usedOffDays: number;
  overrideApproved?: boolean;
}

export interface LeaveBonusResult {
  usedOffDays: number;
  eligibleBonusDays: number;
  ratePerDay: number;
  bonusAmount: number;
  overrideApproved: boolean;
  capped: boolean;
}

export function toLeaveBonusParams(
  rules: LeaveRulesSetting,
  entitledMonthlyOffDays?: number,
): LeaveBonusParams {
  const monthlyOffDays = entitledMonthlyOffDays ?? rules.monthlyOffDays;
  const ratePerDay = rules.unusedOffDayBonusAmount;
  const fullCapDays = ratePerDay > 0
    ? Math.floor(rules.unusedOffDayBonusCap / ratePerDay)
    : 0;
  const maxEligibleDays = entitledMonthlyOffDays != null && entitledMonthlyOffDays < rules.monthlyOffDays
    ? Math.min(fullCapDays, monthlyOffDays)
    : fullCapDays;

  return {
    monthlyOffDays,
    ratePerDay,
    maxEligibleDays,
  };
}

export function computeLeaveBonus(
  params: LeaveBonusParams,
  input: LeaveBonusInput,
): LeaveBonusResult {
  const usedOffDays = Math.max(0, input.usedOffDays);
  const unusedOffDays = params.monthlyOffDays - usedOffDays;
  const overrideApproved = input.overrideApproved ?? false;

  let eligibleBonusDays: number;
  let capped = false;

  if (overrideApproved) {
    eligibleBonusDays = Math.max(0, unusedOffDays);
  } else {
    const uncappedEligible = Math.max(0, unusedOffDays);
    eligibleBonusDays = Math.min(params.maxEligibleDays, uncappedEligible);
    capped = uncappedEligible > params.maxEligibleDays;
  }

  const bonusAmount = roundMoney(eligibleBonusDays * params.ratePerDay);

  return {
    usedOffDays,
    eligibleBonusDays,
    ratePerDay: params.ratePerDay,
    bonusAmount,
    overrideApproved,
    capped,
  };
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
