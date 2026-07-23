import { apiGet } from './client';

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
  shift: {
    shiftName: string;
    shiftStartAt: string | null;
    shiftEndAt: string | null;
  } | null;
  attendance: {
    checkInAt: string | null;
    checkOutAt: string | null;
    lateMinutes: number;
    needsRecalculation: boolean;
  } | null;
  overtime: { otHours: number; amount: number; status: string | null };
  exceptions: Array<{ type: string; label: string }>;
  timeline: Array<{ date: string; state: WorkDayState; label: string }>;
}

export interface AttendanceCommandCenterDto {
  date: string;
  companyId: string;
  summary: Record<WorkDayState, number>;
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
  exceptions: Array<{
    type: string;
    label: string;
    count: number;
    items: WorkDayEmployeeRef[];
  }>;
}

export interface PayrollPreviewDto {
  month: string;
  baseSalary: number;
  approvedOvertime: number;
  netPreview: number;
  needsRecalculation: boolean;
  needsRecalculationWarning: string | null;
  breakdown: Array<{ label: string; amount: number; direction: 'earning' | 'deduction' }>;
}

export function fetchAttendanceCommandCenter(companyId: string, date?: string) {
  return apiGet<AttendanceCommandCenterDto>(
    `/companies/${companyId}/attendance-command-center`,
    date ? { date } : undefined,
  );
}

export function fetchEmployeeWorkDayToday(employeeId: string) {
  return apiGet<WorkDayDto>(`/employees/${employeeId}/workdays/today`);
}

export function fetchEmployeeMonthWorkDays(employeeId: string, month: string) {
  return apiGet<WorkDayDto[]>(`/employees/${employeeId}/workdays`, { month });
}

export function fetchEmployeePayrollPreview(employeeId: string, month: string) {
  return apiGet<PayrollPreviewDto>(`/employees/${employeeId}/payroll-preview`, { month });
}

export interface WorkforceRiskResult {
  date: string;
  companyId: string;
  overallLevel: 'GREEN' | 'YELLOW' | 'ORANGE' | 'RED';
  atRiskCount: number;
  teams: Array<{
    teamId: string | null;
    teamName: string | null;
    level: string;
    availableCount: number;
    requiredMinimum: number;
    shortage: number;
    reasons: string[];
    recommendations: string[];
  }>;
}

export function fetchWorkforceRisk(companyId: string, date?: string) {
  return apiGet<WorkforceRiskResult>(`/companies/${companyId}/workforce-risk`, date ? { date } : undefined);
}
