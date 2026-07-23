import { apiGet, apiPost } from './client';

export type ExitCaseType = 'resignation' | 'termination' | 'absconding';
export type ExitLifecycleStatus = 'OPEN' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';

export interface ExitCaseSummaryRow {
  id: string;
  employeeId: string;
  employeeName: string;
  exitType: ExitCaseType;
  lifecycleStatus: ExitLifecycleStatus;
  status: string;
  effectiveTerminationDate: string;
  pendingChecklistCount: number;
  pendingItems?: string[];
  daysUntil?: number;
}

export interface ExitDashboard {
  activeExitCases: ExitCaseSummaryRow[];
  pendingClearance: ExitCaseSummaryRow[];
  upcomingEffectiveDates: ExitCaseSummaryRow[];
}

export interface ExitChecklistItem {
  id: string;
  exitCaseId: string;
  itemKey: string;
  label: string;
  sortOrder: number;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
}

export interface ExitCaseRecord {
  id: string;
  employeeId: string;
  companyId: string;
  exitReason: string;
  exitType: ExitCaseType;
  lifecycleStatus: ExitLifecycleStatus;
  sourceType: string;
  sourceId: string | null;
  status: string;
  effectiveTerminationDate: string;
  pendingChecklistCount: number;
  notes: string | null;
  closedAt: string | null;
  checklistItems?: ExitChecklistItem[];
}

export interface EmployeeExitHistory {
  activeCase: ExitCaseRecord | null;
  history: ExitCaseRecord[];
}

export function fetchExitDashboard(companyId: string): Promise<ExitDashboard> {
  return apiGet<ExitDashboard>('/exit-cases/dashboard', { companyId });
}

export function fetchEmployeeExitHistory(
  employeeId: string,
  companyId: string,
): Promise<EmployeeExitHistory> {
  return apiGet<EmployeeExitHistory>(`/employees/${employeeId}/exit-cases`, { companyId });
}

export function cancelExitCase(
  exitCaseId: string,
  cancellationReason: string,
): Promise<ExitCaseRecord> {
  return apiPost<ExitCaseRecord>(`/exit-cases/${exitCaseId}/cancel`, { cancellationReason });
}
