// ============================================================================
// Off-day units for unused off-day OT bonus (฿600/day, max 2 days/month).
// Monthly off + other approved leave days count toward usage.
// Emergency leave counts as 2 units per calendar day (does not use monthly-off quota).
// ============================================================================

import {
  isEmergencyLeaveType,
  isMonthlyOffLeaveType,
} from '../../../leave/domain/services/leave-type-classification';
import { computeLeaveBonus, toLeaveBonusParams } from './leave-bonus.service';
import type { LeaveRulesSetting } from '../../../settings/domain/leave-settings.types';

export function offDayUnitsForLeaveType(code: string): number {
  if (isMonthlyOffLeaveType(code)) return 0;
  if (isEmergencyLeaveType(code)) return 2;
  return 1;
}

export function eachDateIsoInRange(
  start: Date,
  end: Date,
  periodStartIso: string,
  periodEndIso: string,
): string[] {
  const from = start > new Date(`${periodStartIso}T00:00:00.000Z`)
    ? start
    : new Date(`${periodStartIso}T00:00:00.000Z`);
  const to = end < new Date(`${periodEndIso}T00:00:00.000Z`)
    ? end
    : new Date(`${periodEndIso}T00:00:00.000Z`);
  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

export interface MonthlyOffDateRow {
  selectedDates: unknown;
  status: string;
}

export interface LeaveDayRow {
  startDate: Date;
  endDate: Date;
  status: string;
  leaveTypeCode: string;
}

export interface CountOffDayUnitsInput {
  periodStartIso: string;
  periodEndIso: string;
  monthlyOffRows: MonthlyOffDateRow[];
  leaveRows: LeaveDayRow[];
  extraMonthlyOffDates?: string[];
  includePending?: boolean;
}

export function countOffDayUnits(input: CountOffDayUnitsInput): number {
  const includePending = input.includePending ?? true;
  const allowedStatuses = includePending
    ? new Set(['approved', 'pending', 'in_review', 'submitted'])
    : new Set(['approved']);

  let units = 0;

  for (const row of input.monthlyOffRows) {
    if (!allowedStatuses.has(row.status)) continue;
    const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
    for (const date of dates) {
      if (date >= input.periodStartIso && date <= input.periodEndIso) units += 1;
    }
  }

  for (const date of input.extraMonthlyOffDates ?? []) {
    if (date >= input.periodStartIso && date <= input.periodEndIso) units += 1;
  }

  for (const row of input.leaveRows) {
    if (!allowedStatuses.has(row.status)) continue;
    const weight = offDayUnitsForLeaveType(row.leaveTypeCode);
    if (weight <= 0) continue;
    const days = eachDateIsoInRange(
      row.startDate,
      row.endDate,
      input.periodStartIso,
      input.periodEndIso,
    );
    units += days.length * weight;
  }

  return units;
}

export interface OtBonusPreview {
  usedOffDayUnits: number;
  eligibleBonusDays: number;
  bonusAmount: number;
  ratePerDay: number;
  maxBonusDays: number;
}

export function previewOtBonus(
  rules: LeaveRulesSetting,
  usedOffDayUnits: number,
  entitledMonthlyOffDays?: number,
): OtBonusPreview {
  const params = toLeaveBonusParams(rules, entitledMonthlyOffDays);
  const result = computeLeaveBonus(params, { usedOffDays: usedOffDayUnits });
  return {
    usedOffDayUnits,
    eligibleBonusDays: result.eligibleBonusDays,
    bonusAmount: result.bonusAmount,
    ratePerDay: result.ratePerDay,
    maxBonusDays: params.maxEligibleDays,
  };
}
