import { apiGet, apiPost, apiPut, apiDelete } from './client';

export interface ShiftOption {
  id: string;
  name: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
  isActive?: boolean;
}

export interface ShiftAssignmentView {
  id: string;
  shiftId: string;
  shiftName: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
  reason: string | null;
  assignedById: string | null;
  createdAt: string;
}

export interface EmployeeShiftProfile {
  current: ShiftAssignmentView | null;
  nextScheduled: ShiftAssignmentView | null;
  history: ShiftAssignmentView[];
}

export interface ScheduleShiftAssignmentPayload {
  companyId: string;
  shiftId: string;
  effectiveFrom: string;
  effectiveTo?: string | null;
  reason?: string;
}

export function fetchCompanyShifts(companyId: string) {
  return apiGet<ShiftOption[]>(`/companies/${companyId}/shifts`);
}

export interface ShiftPayload {
  name: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight?: boolean;
}

export function createCompanyShift(companyId: string, body: ShiftPayload) {
  return apiPost<{ id: string }>(`/companies/${companyId}/shifts`, body);
}

export function updateCompanyShift(
  companyId: string,
  shiftId: string,
  body: Partial<ShiftPayload> & { isActive?: boolean },
) {
  return apiPut<{ id: string }>(`/companies/${companyId}/shifts/${shiftId}`, body);
}

export function deleteCompanyShift(companyId: string, shiftId: string) {
  return apiDelete<{ id: string }>(`/companies/${companyId}/shifts/${shiftId}`);
}

export function parseTimeToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return hours * 60 + minutes;
}

export function fetchEmployeeShiftProfile(employeeId: string, companyId: string) {
  return apiGet<EmployeeShiftProfile>(
    `/employees/${employeeId}/shift-assignments`,
    { companyId },
  );
}

export function scheduleShiftAssignment(
  employeeId: string,
  body: ScheduleShiftAssignmentPayload,
) {
  return apiPost<{ id: string }>(`/employees/${employeeId}/shift-assignments`, body);
}

export function formatShiftMinutes(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
