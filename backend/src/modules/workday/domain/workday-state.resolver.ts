// ============================================================================
// modules/workday/domain/workday-state.resolver.ts
// Central state resolution — single source of truth for Work Day Engine.
// ============================================================================

import { WorkDayState } from './workday-state.types';

export interface WorkDayResolveInput {
  dateIso: string;
  todayIso: string;
  nowMinutes: number;
  isHoliday: boolean;
  approvedLeave: boolean;
  pendingLeave: boolean;
  approvedMonthlyOff: boolean;
  pendingMonthlyOff: boolean;
  hasAbsence: boolean;
  attendance: {
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakStartAt: Date | null;
    breakEndAt: Date | null;
    needsRecalculation: boolean;
  } | null;
  overtime: { status: 'pending' | 'approved' | 'rejected' } | null;
  shiftEndMinutes: number | null;
  graceMinutes: number;
  breakMinutes: number;
  missingCheckIn: boolean;
  missingCheckOut: boolean;
  breakTooLong: boolean;
}

export function resolveWorkDayState(input: WorkDayResolveInput): WorkDayState {
  if (input.approvedLeave) return 'LEAVE';
  if (input.approvedMonthlyOff) return 'MONTHLY_OFF';
  if (input.isHoliday) return 'HOLIDAY';

  const att = input.attendance;
  if (att?.needsRecalculation) return 'NEEDS_RECALCULATION';

  if (att) {
    if (att.checkInAt && att.breakStartAt && !att.breakEndAt) return 'BREAK';
    if (att.checkInAt && !att.checkOutAt) return 'WORKING';
    if (att.checkOutAt) {
      if (input.overtime?.status === 'pending') return 'OT';
      return 'FINISHED';
    }
  }

  if (input.hasAbsence && !att?.checkInAt) return 'ABSENT';
  if (input.missingCheckOut) return 'MISSING_CHECK_OUT';
  if (input.missingCheckIn) return 'MISSING_CHECK_IN';

  return 'SCHEDULED';
}

export function isWeekendDate(dateIso: string): boolean {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  const day = d.getUTCDay();
  return day === 0 || day === 6;
}

export function shouldFlagMissingCheckIn(input: {
  dateIso: string;
  todayIso: string;
  nowMinutes: number;
  shiftStartMinutes: number;
  graceMinutes: number;
  checkInAt: Date | null;
  approvedLeave: boolean;
  approvedMonthlyOff: boolean;
  isHoliday: boolean;
}): boolean {
  if (input.dateIso > input.todayIso) return false;
  if (input.approvedLeave || input.approvedMonthlyOff || input.isHoliday) return false;
  if (input.checkInAt) return false;
  if (input.dateIso < input.todayIso) return true;
  return input.nowMinutes > input.shiftStartMinutes + input.graceMinutes;
}

export function shouldFlagMissingCheckOut(input: {
  dateIso: string;
  todayIso: string;
  nowMinutes: number;
  shiftEndMinutes: number;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  approvedLeave: boolean;
  approvedMonthlyOff: boolean;
  isHoliday: boolean;
}): boolean {
  if (!input.checkInAt || input.checkOutAt) return false;
  if (input.approvedLeave || input.approvedMonthlyOff || input.isHoliday) return false;
  if (input.dateIso < input.todayIso) return true;
  if (input.dateIso === input.todayIso) {
    return input.nowMinutes > input.shiftEndMinutes + 30;
  }
  return false;
}

export function shouldFlagBreakTooLong(input: {
  breakStartAt: Date | null;
  breakEndAt: Date | null;
  now: Date;
  breakMinutes: number;
}): boolean {
  if (!input.breakStartAt || input.breakEndAt) return false;
  const elapsed = Math.floor((input.now.getTime() - input.breakStartAt.getTime()) / 60000);
  return elapsed > input.breakMinutes + 15;
}
