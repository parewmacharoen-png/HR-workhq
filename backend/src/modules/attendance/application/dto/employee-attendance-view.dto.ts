export type EmployeeTodayAttendanceStatus =
  | 'not_checked_in'
  | 'working'
  | 'checked_out'
  | 'absent'
  | 'leave'
  | 'holiday';

export type EmployeeAttendanceHistoryStatus =
  | 'working'
  | 'checked_out'
  | 'late'
  | 'absent'
  | 'leave'
  | 'holiday'
  | 'incomplete';

export interface EmployeeAttendanceSummaryDto {
  todayStatus: EmployeeTodayAttendanceStatus;
  lastCheckInAt: string | null;
  lastCheckOutAt: string | null;
  lateCountMonth: number;
  absentCountMonth: number;
  otHoursMonth: number;
  workingDaysMonth: number;
  officeDaysMonth: number;
  wfhDaysMonth: number;
  /** Approved monthly-off days in the current payroll/calendar month. */
  holidayDaysMonth: number;
  /** Approved leave days overlapping the current month. */
  leaveDaysMonth: number;
  /** Days with break overage / break deduction this month. */
  breakOverCountMonth: number;
}

export interface EmployeeAttendanceHistoryItemDto {
  id: string;
  date: string;
  shift: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  breakMinutes: number;
  /** Allowed break minutes from attendance rules (same for company). */
  breakAllowedMinutes?: number;
  /** Minutes over the allowed break allowance. */
  breakOverageMinutes?: number;
  /** Stored payroll break deduction amount for the day (THB). */
  breakDeduction?: number;
  /** Penalty tier: none | hourly | half_day | absence. */
  breakPenaltyTier?: string | null;
  workedHours: number;
  otHours: number;
  /** Approved OT window start (ISO), when available. */
  otStartAt?: string | null;
  /** Approved OT window end (ISO), when available. */
  otEndAt?: string | null;
  otReason?: string | null;
  /** Primary overtime_records.id for edit/delete. */
  overtimeRecordId?: string | null;
  /**
   * False when OT exists without a real check-in (invalid / needs HR cleanup).
   * Valid OT requires check-in and must be outside shift hours.
   */
  otValid?: boolean;
  lateMinutes: number;
  status: EmployeeAttendanceHistoryStatus;
  workCategory: string;
  /** Present when status is leave (approved leave request covering this date). */
  leaveTypeCode?: string | null;
  leaveTypeName?: string | null;
  leaveRequestId?: string | null;
}

export interface EmployeeAttendanceViewDto {
  summary: EmployeeAttendanceSummaryDto;
  history: EmployeeAttendanceHistoryItemDto[];
}
