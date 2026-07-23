// ============================================================================
// modules/workday/domain/workday-state.types.ts
// Foundation Sprint — WorkHQ v1 Work Day Engine
// ============================================================================

export type WorkDayState =
  | 'SCHEDULED'
  | 'WORKING'
  | 'BREAK'
  | 'OT'
  | 'FINISHED'
  | 'MONTHLY_OFF'
  | 'LEAVE'
  | 'ABSENT'
  | 'HOLIDAY'
  | 'MISSING_CHECK_IN'
  | 'MISSING_CHECK_OUT'
  | 'NEEDS_RECALCULATION';

export type WorkDayExceptionType =
  | 'missing_check_in'
  | 'missing_check_out'
  | 'break_too_long'
  | 'needs_recalculation'
  | 'ot_pending'
  | 'monthly_off_pending'
  | 'leave_pending';

export interface WorkDayAttendanceSnapshot {
  id: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  breakStartAt: string | null;
  breakEndAt: string | null;
  lateMinutes: number;
  roundedLateHours: number;
  lateDeduction: number;
  workedMinutes: number;
  needsRecalculation: boolean;
}

export interface WorkDayShiftSnapshot {
  shiftId: string | null;
  shiftName: string;
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
}

export interface WorkDayLeaveSnapshot {
  requestId: string | null;
  leaveTypeCode: string | null;
  leaveTypeName: string | null;
  status: 'approved' | 'pending' | null;
}

export interface WorkDayMonthlyOffSnapshot {
  requestId: string | null;
  status: 'approved' | 'pending' | null;
}

export interface WorkDayOvertimeSnapshot {
  id: string | null;
  otHours: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | null;
}

export interface WorkDayException {
  type: WorkDayExceptionType;
  label: string;
  severity: 'info' | 'warning' | 'action';
}

export interface WorkDayPayrollImpact {
  lateDeduction: number;
  overtimeAmount: number;
  manualBonus: number;
  manualCommission: number;
  manualAllowance: number;
  manualDeduction: number;
  unpaidLeaveDeduction: number;
  totalImpact: number;
}

export interface WorkDayTimelineEntry {
  date: string;
  state: WorkDayState;
  label: string;
}

export interface WorkDayEmployeeRef {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  teamName: string | null;
}

export interface WorkDayDto {
  employee: WorkDayEmployeeRef;
  date: string;
  state: WorkDayState;
  shift: WorkDayShiftSnapshot | null;
  attendance: WorkDayAttendanceSnapshot | null;
  monthlyOff: WorkDayMonthlyOffSnapshot | null;
  leave: WorkDayLeaveSnapshot | null;
  overtime: WorkDayOvertimeSnapshot | null;
  exceptions: WorkDayException[];
  payrollImpact: WorkDayPayrollImpact | null;
  timeline: WorkDayTimelineEntry[];
}

export interface WorkDayStateGroup {
  state: WorkDayState;
  label: string;
  count: number;
  employees: Array<WorkDayEmployeeRef & { state: WorkDayState; lateMinutes?: number }>;
}

export interface AttendanceCommandCenterDto {
  date: string;
  companyId: string;
  summary: Record<WorkDayState, number>;
  groups: WorkDayStateGroup[];
  exceptions: Array<{
    type: WorkDayExceptionType;
    label: string;
    count: number;
    items: Array<WorkDayEmployeeRef & { detail?: string }>;
  }>;
  widgets: {
    working: WorkDayDto[];
    late: WorkDayDto[];
    notCheckedIn: WorkDayDto[];
    onBreak: WorkDayDto[];
    ot: WorkDayDto[];
    offDay: WorkDayDto[];
    onLeave: WorkDayDto[];
    needsAction: WorkDayDto[];
  };
}

export const WORKDAY_STATE_LABELS: Record<WorkDayState, string> = {
  SCHEDULED: 'รอเข้างาน',
  WORKING: 'ทำงานอยู่',
  BREAK: 'พักอยู่',
  OT: 'OT',
  FINISHED: 'เลิกงานแล้ว',
  MONTHLY_OFF: 'วันหยุดประจำเดือน',
  LEAVE: 'ลา',
  ABSENT: 'ขาดงาน',
  HOLIDAY: 'วันหยุด',
  MISSING_CHECK_IN: 'ยังไม่เข้างาน',
  MISSING_CHECK_OUT: 'ยังไม่ออกงาน',
  NEEDS_RECALCULATION: 'ต้องตรวจสอบ',
};
