// ============================================================================
// Shared per-employee day classification for attendance alerts & absence flagging.
// ============================================================================

import { BANGKOK_TZ } from '../../../../shared/time/bangkok-time.provider';

export type EmployeeDayType =
  | 'workday'
  | 'holiday'
  | 'monthly_off'
  | 'leave';

export interface EmployeeDayContext {
  dayType: EmployeeDayType;
  /** Employee should not receive check-in/out reminders. */
  skipAttendanceAlerts: boolean;
  /** End-of-day job should not flag absence. */
  skipAbsenceFlag: boolean;
}

export function formatBangkokDateIso(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function datesIncludeSelectedDate(selectedDates: unknown, dateIso: string): boolean {
  if (!Array.isArray(selectedDates)) return false;
  return selectedDates.includes(dateIso);
}

export function resolveEmployeeDayContext(input: {
  hasApprovedLeave: boolean;
  hasApprovedMonthlyOff: boolean;
  isHoliday: boolean;
}): EmployeeDayContext {
  if (input.hasApprovedLeave) {
    return { dayType: 'leave', skipAttendanceAlerts: true, skipAbsenceFlag: true };
  }
  if (input.hasApprovedMonthlyOff) {
    return { dayType: 'monthly_off', skipAttendanceAlerts: true, skipAbsenceFlag: true };
  }
  if (input.isHoliday) {
    // Reserved for future company public holidays — not weekends.
    return { dayType: 'holiday', skipAttendanceAlerts: true, skipAbsenceFlag: true };
  }
  return { dayType: 'workday', skipAttendanceAlerts: false, skipAbsenceFlag: false };
}
