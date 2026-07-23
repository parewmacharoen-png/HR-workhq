import { apiGet, apiPost } from './client';

export interface TelegramInviteResponse {
  inviteId: string;
  inviteLink: string;
  token?: string;
  expiresAt: string;
  status: string;
}

export interface NewEmployeeInvitePayload {
  companyId: string;
  additionalCompanyIds?: string[];
  companyAssignments?: Array<{
    companyId: string;
    department?: string;
    departmentId?: string;
    teamId?: string;
  }>;
  businessRole?: string;
  employmentType?: string;
  startDate?: string;
  employeeId?: string;
  departmentId?: string;
  department?: string;
  teamId?: string;
  position?: string;
  shiftId?: string;
  workLocation?: string;
  monthlySalary?: number;
  depositCollectionCompanyId?: string;
  expiresAt?: string;
  note?: string;
}

export function createTelegramInvite(employeeId: string, companyId: string) {
  return apiPost<TelegramInviteResponse>(`/employees/${employeeId}/telegram-invite`, { companyId });
}

export function createNewEmployeeTelegramInvite(payload: NewEmployeeInvitePayload) {
  return apiPost<TelegramInviteResponse>('/employee-telegram-invites', payload);
}

export function createQuickEmployeeTelegramInvite(payload: {
  companyId: string;
  additionalCompanyIds?: string[];
}) {
  return apiPost<TelegramInviteResponse>('/employee-telegram-invites/quick', payload);
}

export function listCompanyTelegramInvites(companyId: string, status?: string) {
  const q = new URLSearchParams({ companyId });
  if (status) q.set('status', status);
  return apiGet<{ items: Array<Record<string, unknown>>; total: number }>(`/employee-telegram-invites?${q}`);
}

export function getTelegramInviteDetail(id: string) {
  return apiGet<Record<string, unknown>>(`/employee-telegram-invites/${id}`);
}

export function regenerateTelegramInvite(id: string) {
  return apiPost<TelegramInviteResponse>(`/employee-telegram-invites/${id}/regenerate`, {});
}

export function cancelTelegramInvite(id: string, reason?: string) {
  return apiPost(`/employee-telegram-invites/${id}/cancel`, { reason });
}

export function listEmployeeTelegramInvites(employeeId: string) {
  return apiGet<Array<Record<string, unknown>>>(`/employees/${employeeId}/telegram-invites`);
}

export function listSelfOnboardingSubmissions(params: { companyId?: string; status?: string }) {
  const q = new URLSearchParams();
  if (params.companyId) q.set('companyId', params.companyId);
  if (params.status) q.set('status', params.status);
  return apiGet<{ items: Array<Record<string, unknown>>; total: number }>(
    `/self-onboarding/submissions?${q.toString()}`,
  );
}

export function getSelfOnboardingSubmission(id: string) {
  return apiGet<Record<string, unknown>>(`/self-onboarding/submissions/${id}`);
}

export function approveSelfOnboarding(id: string, body?: { approvedFields?: string[]; approvedDocumentIds?: string[] }) {
  return apiPost(`/self-onboarding/submissions/${id}/approve`, body ?? {});
}

export function rejectSelfOnboarding(id: string, reason: string) {
  return apiPost(`/self-onboarding/submissions/${id}/reject`, { reason });
}

export function getEmployeeOnboardingStatus(employeeId: string) {
  return apiGet<Record<string, unknown>>(`/employees/${employeeId}/self-onboarding`);
}

export interface OnboardingDashboardStats {
  notConnected: number;
  invitePending: number;
  inviteExpired: number;
  inProgress: number;
  pendingReview: number;
  pendingDocuments: number;
}

export function getOnboardingDashboardStats(companyId: string) {
  return apiGet<OnboardingDashboardStats>(`/self-onboarding/dashboard-stats?companyId=${encodeURIComponent(companyId)}`);
}
