import { apiDeleteWithBody, apiGet, apiPatch } from './client';

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

export interface EmployeeAttendanceSummary {
  todayStatus: EmployeeTodayAttendanceStatus;
  lastCheckInAt: string | null;
  lastCheckOutAt: string | null;
  lateCountMonth: number;
  absentCountMonth: number;
  otHoursMonth: number;
  workingDaysMonth: number;
  officeDaysMonth: number;
  wfhDaysMonth: number;
  holidayDaysMonth: number;
  leaveDaysMonth: number;
  breakOverCountMonth: number;
}

export interface EmployeeAttendanceHistoryItem {
  id: string;
  date: string;
  shift: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  breakMinutes: number;
  breakAllowedMinutes?: number;
  breakOverageMinutes?: number;
  breakDeduction?: number;
  breakPenaltyTier?: string | null;
  workedHours: number;
  otHours: number;
  otStartAt?: string | null;
  otEndAt?: string | null;
  otReason?: string | null;
  overtimeRecordId?: string | null;
  /** False when OT exists without check-in (invalid). */
  otValid?: boolean;
  lateMinutes: number;
  status: EmployeeAttendanceHistoryStatus;
  workCategory: string;
  leaveTypeCode?: string | null;
  leaveTypeName?: string | null;
  leaveRequestId?: string | null;
}

export interface EmployeeAttendanceResponse {
  summary: EmployeeAttendanceSummary;
  history: EmployeeAttendanceHistoryItem[];
}

export function fetchEmployeeAttendance(employeeId: string, companyId: string) {
  return apiGet<EmployeeAttendanceResponse>(
    `/employees/${employeeId}/attendance?companyId=${encodeURIComponent(companyId)}`,
  );
}

export interface UpdateEmployeeAttendanceRecordInput {
  companyId: string;
  reason: string;
  checkInAt?: string | null;
  checkOutAt?: string | null;
  breakMinutes?: number;
  workedHours?: number;
  lateMinutes?: number;
  otHours?: number;
  shift?: 'day' | 'night';
  workCategory?: 'office' | 'wfh';
}

export function updateEmployeeAttendanceRecord(
  employeeId: string,
  recordId: string,
  body: UpdateEmployeeAttendanceRecordInput,
) {
  return apiPatch<{ id: string }>(
    `/attendance/employees/${employeeId}/records/${recordId}`,
    body,
  );
}

export function deleteEmployeeOvertimeRecord(
  employeeId: string,
  overtimeId: string,
  body: { companyId: string; reason: string },
) {
  return apiDeleteWithBody<{ id: string; deleted: boolean }>(
    `/attendance/employees/${employeeId}/overtime/${overtimeId}`,
    body,
  );
}
