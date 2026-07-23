import { apiDelete, apiGet, apiPatch, apiPut } from './client';

export interface EmployeeLeaveYearUsage {
  leaveTypeCode: string;
  leaveTypeName: string;
  priorUsed: number;
  systemUsed: number;
  totalUsed: number;
  remaining: number | null;
}

export interface EmployeeLeaveBalanceEdit {
  leaveTypeCode: 'emergency' | 'sick' | 'unpaid';
  leaveTypeName: string;
  priorUsed: number;
  entitled: number;
  entitledEditable: boolean;
}

export interface EmployeeLeaveSummary {
  annualLeaveRemaining: number;
  emergencyLeaveRemaining: number;
  sickLeaveUsed: number;
  unpaidLeaveUsed: number;
  leaveRequestsThisYear: number;
  pendingRequests: number;
  approvedRequests: number;
  rejectedRequests: number;
  cancelledRequests: number;
  yearUsage: EmployeeLeaveYearUsage[];
}

export interface EmployeeLeaveHistoryItem {
  id: string;
  requestDate: string;
  leaveTypeCode: string;
  leaveTypeName: string;
  startDate: string;
  endDate: string;
  days: number;
  status: string;
  approverName: string | null;
  reason: string | null;
  workflowInstanceId: string | null;
  shortNotice?: boolean;
  source?: 'leave_request' | 'monthly_off' | 'off_day_change';
  /** Previous off date when this row is a day-change (ISO YYYY-MM-DD). */
  previousDate?: string | null;
}

export interface EmployeeLeaveResponse {
  summary: EmployeeLeaveSummary;
  history: EmployeeLeaveHistoryItem[];
  balances: EmployeeLeaveBalanceEdit[];
}

export function fetchEmployeeLeave(employeeId: string, companyId: string) {
  return apiGet<EmployeeLeaveResponse>(
    `/employees/${employeeId}/leave?companyId=${encodeURIComponent(companyId)}`,
  );
}

export interface LeaveBalanceOption {
  leaveTypeCode: string;
  leaveTypeName: string;
}

export function fetchEmployeeLeaveBalances(employeeId: string, companyId: string) {
  return apiGet<LeaveBalanceOption[]>(
    `/leave/employees/${employeeId}/balances?companyId=${encodeURIComponent(companyId)}`,
  );
}

export interface UpdateEmployeeLeaveBalancesInput {
  items: Array<{
    leaveTypeCode: 'emergency' | 'sick' | 'unpaid';
    priorUsed: number;
    entitled?: number;
  }>;
}

export function updateEmployeeLeaveBalances(
  employeeId: string,
  companyId: string,
  body: UpdateEmployeeLeaveBalancesInput,
) {
  return apiPut<EmployeeLeaveResponse>(
    `/employees/${employeeId}/leave/balances?companyId=${encodeURIComponent(companyId)}`,
    body,
  );
}

export interface UpdateEmployeeLeaveRequestInput {
  leaveTypeCode?: string;
  startDate?: string;
  endDate?: string;
  days?: number;
  reason?: string;
  correctionReason: string;
  source?: 'leave_request' | 'monthly_off';
  offDate?: string;
}

function historyItemId(item: EmployeeLeaveHistoryItem): string {
  if (item.source === 'monthly_off') {
    return item.id.includes(':') ? item.id.slice(0, 36) : item.id;
  }
  return item.id;
}

export function updateEmployeeLeaveRequest(
  employeeId: string,
  companyId: string,
  item: EmployeeLeaveHistoryItem,
  body: UpdateEmployeeLeaveRequestInput,
) {
  const itemId = historyItemId(item);
  const source = item.source ?? 'leave_request';
  return apiPatch<EmployeeLeaveResponse>(
    `/employees/${employeeId}/leave/items/${itemId}?companyId=${encodeURIComponent(companyId)}`,
    {
      source,
      leaveTypeCode: body.leaveTypeCode,
      startDate: body.startDate,
      endDate: body.endDate,
      days: body.days,
      reason: body.reason,
      correctionReason: body.correctionReason,
      offDate: source === 'monthly_off' ? (body.offDate ?? item.startDate) : undefined,
    },
  );
}

export function deleteEmployeeLeaveRequest(
  employeeId: string,
  companyId: string,
  item: EmployeeLeaveHistoryItem,
) {
  const itemId = historyItemId(item);
  const source = item.source ?? 'leave_request';
  const params = new URLSearchParams({
    companyId,
    source,
  });
  if (source === 'monthly_off') {
    params.set('offDate', item.startDate);
  }
  return apiDelete<EmployeeLeaveResponse>(
    `/employees/${employeeId}/leave/items/${itemId}?${params.toString()}`,
  );
}
