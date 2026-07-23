import { apiGet, apiPatch, apiPost } from './client';

export interface OnboardingRequestPreview {
  fullName: string | null;
  nickname: string | null;
  phone: string | null;
  email: string | null;
  companyName: string | null;
  departmentName?: string | null;
  teamName: string | null;
  businessRole: string | null;
  position: string | null;
  employmentType: string | null;
  startDate: string | null;
  telegramUserId: string | null;
  telegramUsername: string | null;
  submittedAt: string | null;
}

export interface RequestListItem {
  id: string;
  title: string;
  status: string;
  requesterEmployeeId?: string;
  submittedAt?: string;
  approvedAt?: string;
  rejectedAt?: string;
  requestType?: { nameTh: string; key?: string; icon?: string; category?: string };
  requesterEmployee?: { firstName: string; lastName: string; globalId: string };
  requesterContext?: {
    companyName: string | null;
    teamName: string | null;
    position: string | null;
  };
  summaryLines?: string[];
  onboardingPreview?: OnboardingRequestPreview | null;
  lastActionAt?: string | null;
  lastAction?: string | null;
  lastChannel?: string | null;
  resolvedAt?: string | null;
}

export interface RequestDashboard {
  submittedToday: number;
  pendingApproval: number;
  overdue: number;
  myPendingApprovals: number;
  byType: Array<{ requestTypeId: string; nameTh: string; count: number }>;
}

export function listRequests(params: Record<string, string | undefined>) {
  return apiGet<RequestListItem[]>('/requests', params);
}

export function getRequest(id: string) {
  return apiGet<Record<string, unknown>>(`/requests/${id}`);
}

export function listMyRequests() {
  return apiGet<RequestListItem[]>('/requests/my');
}

export function listPendingApproval() {
  return apiGet<RequestListItem[]>('/requests/pending-approval');
}

export function listRequestApprovalHistory(params: {
  companyId: string;
  status?: string;
  requestTypeKey?: string;
  category?: string;
  limit?: number;
}) {
  return apiGet<RequestListItem[]>('/requests/approval-history', {
    companyId: params.companyId,
    status: params.status,
    requestTypeKey: params.requestTypeKey,
    category: params.category,
    limit: params.limit != null ? String(params.limit) : undefined,
  });
}

export function getRequestDashboard(companyId: string) {
  return apiGet<RequestDashboard>('/requests/dashboard', { companyId });
}

export function approveRequest(id: string, note?: string) {
  return apiPost(`/requests/${id}/approve`, { note });
}

export function rejectRequest(id: string, note: string) {
  return apiPost(`/requests/${id}/reject`, { note });
}

export function patchRequestValues(id: string, values: Record<string, unknown>) {
  return apiPatch<Record<string, unknown>>(`/requests/${id}/values`, { values });
}

export function submitRequest(id: string) {
  return apiPost<Record<string, unknown>>(`/requests/${id}/submit`, {});
}

export function cancelRequest(id: string, reason?: string) {
  return apiPost<Record<string, unknown>>(`/requests/${id}/cancel`, { reason });
}

export function listRequestTypes(companyId?: string) {
  return apiGet<Record<string, unknown>[]>('/request-types', { companyId });
}

export function getRequestType(id: string) {
  return apiGet<Record<string, unknown>>(`/request-types/${id}`);
}

export function publishRequestType(id: string) {
  return apiPost(`/request-types/${id}/publish`, {});
}

export function listEmployeeReferrals(companyId: string, status?: string) {
  return apiGet<Record<string, unknown>[]>('/employee-referrals', { companyId, status });
}

export function getEmployeeReferral(id: string) {
  return apiGet<Record<string, unknown>>(`/employee-referrals/${id}`);
}

export function approveReferralBonus(id: string) {
  return apiPost(`/employee-referrals/${id}/approve-bonus`, {});
}

export function markReferralPaid(id: string) {
  return apiPost(`/employee-referrals/${id}/mark-paid`, {});
}

export function listReferralPrograms(companyId?: string) {
  return apiGet<Record<string, unknown>[]>('/referral-programs', { companyId });
}

export function updateReferralProgram(id: string, body: Record<string, unknown>) {
  return apiPatch(`/referral-programs/${id}`, body);
}
