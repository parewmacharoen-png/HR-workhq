import { apiDeleteWithBody, apiGet, apiPatch, apiPost } from './client';
import type { EmployeeEmploymentResponse, UpdateEmployeeEmploymentPayload } from './employee-employment';
import type { EmployeeFullProfile } from '../components/hr/EmployeeProfileSections';

export interface EmployeeChangeHistoryRow {
  id: string;
  fieldName: string;
  beforeValueJson: unknown;
  afterValueJson: unknown;
  changeType: string;
  reason: string | null;
  changedAt: string;
  changedBy: string | null;
  source?: string | null;
}

export interface EmployeeAuditRow {
  id: string;
  action: string;
  occurredAt: string;
  actorUserId: string | null;
  beforeJson?: unknown;
  afterJson?: unknown;
}

export interface SalaryVisibilityPreview {
  canView: boolean;
  reason: string;
}

export function fetchEmployeeFullProfile(employeeId: string): Promise<EmployeeFullProfile> {
  return apiGet<EmployeeFullProfile>(`/employees/${employeeId}/profile-full`);
}

export function fetchEmployeeChangeHistory(employeeId: string): Promise<EmployeeChangeHistoryRow[]> {
  return apiGet<EmployeeChangeHistoryRow[]>(`/employees/${employeeId}/change-history`);
}

export function fetchEmployeeAuditLog(employeeId: string): Promise<EmployeeAuditRow[]> {
  return apiGet<EmployeeAuditRow[]>(`/employees/${employeeId}/audit`);
}

export function archiveEmployee(employeeId: string, reason: string): Promise<EmployeeFullProfile> {
  return apiPost<EmployeeFullProfile>(`/employees/${employeeId}/archive`, { reason });
}

export function restoreEmployee(employeeId: string, reason: string): Promise<EmployeeFullProfile> {
  return apiPost<EmployeeFullProfile>(`/employees/${employeeId}/restore`, { reason });
}

export function hardDeleteEmployee(
  employeeId: string,
  payload: { reason: string; confirmation: string },
): Promise<{ ok: boolean; id: string }> {
  return apiDeleteWithBody<{ ok: boolean; id: string }>(`/employees/${employeeId}`, payload);
}

export function updateEmployeeEmployment(
  employeeId: string,
  body: UpdateEmployeeEmploymentPayload & { reason?: string },
  companyId?: string,
): Promise<EmployeeEmploymentResponse> {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return apiPatch<EmployeeEmploymentResponse>(`/employees/${employeeId}/employment${query}`, body);
}

export function previewSalaryVisibility(
  viewerUserId: string,
  targetEmployeeId: string,
): Promise<SalaryVisibilityPreview> {
  return apiGet<SalaryVisibilityPreview>('/permissions/salary-visibility/preview', {
    viewerUserId,
    targetEmployeeId,
  });
}
