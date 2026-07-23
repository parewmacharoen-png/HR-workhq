import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface ApprovalPreviewApprover {
  employeeId: string | null;
  userId: string | null;
  name: string;
  strategy: string;
  stepOrder: number;
  stepLabel: string;
}

export interface ApprovalPreviewStep {
  stepOrder: number;
  label: string;
  approverStrategy: string;
  approvers: Array<{ employeeId: string | null; name: string }>;
}

export interface ApprovalPreview {
  workflowType: string;
  approvalMode: string;
  minApprovalCount: number;
  requiresOwner: boolean;
  approvers: ApprovalPreviewApprover[];
  steps: ApprovalPreviewStep[];
}

export interface ApprovalMatrix {
  id: string;
  workflowType: string;
  name: string;
  approvalMode: string;
  minApprovalCount: number;
  active: boolean;
  version: number;
  companyId: string | null;
  steps: Array<{
    stepOrder: number;
    label: string;
    approverStrategy: string;
    fixedUserId: string | null;
    fixedRoleId: string | null;
  }>;
}

export async function previewWorkflow(input: {
  workflowType: string;
  employeeId: string;
  companyId?: string;
  leaveTypeCode?: string;
}): Promise<ApprovalPreview> {
  return apiPost<ApprovalPreview>('/workflow/preview', input);
}

export async function fetchApprovalMatrices(companyId?: string): Promise<ApprovalMatrix[]> {
  return apiGet<ApprovalMatrix[]>('/workflow/approval-matrix', { companyId });
}

export async function updateApprovalMatrix(
  id: string,
  input: { name?: string; minApprovalCount?: number; steps?: ApprovalMatrix['steps'] },
): Promise<ApprovalMatrix> {
  return apiPatch<ApprovalMatrix>(`/workflow/approval-matrix/${id}`, input);
}

export function resolveLeaveWorkflowType(leaveTypeCode: string): string {
  const code = leaveTypeCode.toLowerCase();
  if (code.includes('sick')) return 'leave_sick';
  if (code.includes('emergency')) return 'leave_emergency';
  if (code.includes('unpaid')) return 'leave_unpaid';
  if (code.includes('off') || code === 'annual' || code.includes('personal')) return 'leave_off_day';
  return 'leave_request';
}

// ── Inbox / history / timeline ─────────────────────────────────────────────

export interface ApprovalItemSummary {
  title: string;
  subtitle: string;
  requesterName: string;
  requesterEmployeeId: string | null;
  companyName?: string | null;
  teamName?: string | null;
  position?: string | null;
  detailLines: string[];
}

export interface ApprovalInboxItem {
  instanceId: string;
  entityType: string;
  entityId: string;
  companyId: string | null;
  status: string;
  currentStepOrder: number;
  submittedAt: string;
  summary: ApprovalItemSummary;
}

export interface ApprovalHistoryItem extends ApprovalInboxItem {
  lastActionAt: string | null;
  lastAction: string | null;
  lastChannel: string | null;
  resolvedAt: string | null;
}

export interface ApprovalTimelineEntry {
  id: string;
  kind: 'submitted' | 'action';
  stepOrder: number | null;
  action: string | null;
  actorUserId: string | null;
  actorName: string;
  channel: string | null;
  comment: string | null;
  occurredAt: string;
  isOwnerOverride: boolean;
}

export interface ApprovalDelegation {
  id: string;
  delegatorUserId: string;
  delegatorName: string;
  delegateUserId: string;
  delegateName: string;
  companyId: string | null;
  entityType: string | null;
  reason: string | null;
  validFrom: string;
  validTo: string;
  isActive: boolean;
}

export async function fetchApprovalInbox(params?: {
  companyId?: string;
  entityType?: string;
  limit?: number;
}): Promise<ApprovalInboxItem[]> {
  const query: Record<string, string | undefined> = {
    companyId: params?.companyId,
    entityType: params?.entityType,
    limit: params?.limit != null ? String(params.limit) : undefined,
  };
  return apiGet<ApprovalInboxItem[]>('/workflow/inbox', query);
}

export async function fetchApprovalHistory(params?: {
  companyId?: string;
  status?: string;
  entityType?: string;
  from?: string;
  to?: string;
  limit?: number;
}): Promise<ApprovalHistoryItem[]> {
  const query: Record<string, string | undefined> = {
    companyId: params?.companyId,
    status: params?.status,
    entityType: params?.entityType,
    from: params?.from,
    to: params?.to,
    limit: params?.limit != null ? String(params.limit) : undefined,
  };
  return apiGet<ApprovalHistoryItem[]>('/workflow/history', query);
}

export async function fetchApprovalTimeline(instanceId: string): Promise<{
  timeline: ApprovalTimelineEntry[];
  instance: ApprovalHistoryItem;
}> {
  return apiGet(`/workflow/instances/${instanceId}/timeline`);
}

export async function actOnWorkflow(
  instanceId: string,
  input: { action: 'approve' | 'reject'; comment?: string },
): Promise<{ status: string }> {
  return apiPost(`/workflow/instances/${instanceId}/actions`, input);
}

export async function fetchDelegations(): Promise<ApprovalDelegation[]> {
  return apiGet<ApprovalDelegation[]>('/workflow/delegations');
}

export async function createDelegation(input: {
  delegateUserId: string;
  companyId?: string;
  entityType?: string;
  validFrom: string;
  validTo: string;
  reason?: string;
}): Promise<ApprovalDelegation> {
  return apiPost<ApprovalDelegation>('/workflow/delegations', input);
}

export async function revokeDelegation(id: string): Promise<void> {
  return apiDelete(`/workflow/delegations/${id}`);
}

// ── Approval hub (scale ~100 staff) ─────────────────────────────────────────

export interface ApprovalDailySummary {
  pendingTotal: number;
  submittedToday: number;
  leavePending: number;
  otPending: number;
  monthlyOffPending: number;
  attendancePending: number;
  otherPending: number;
  overdue48h: number;
}

export interface UnifiedPendingItem {
  instanceId: string;
  source: 'workflow' | 'request';
  entityType: string;
  requestTypeKey: string | null;
  category: string;
  status: string;
  submittedAt: string;
  summary: ApprovalItemSummary;
}

export interface PaginatedPendingResult {
  items: UnifiedPendingItem[];
  total: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export async function fetchApprovalHubSummary(companyId?: string): Promise<ApprovalDailySummary> {
  return apiGet<ApprovalDailySummary>('/workflow/approval-hub/summary', { companyId });
}

export async function fetchApprovalHubPending(params?: {
  companyId?: string;
  search?: string;
  category?: string;
  limit?: number;
  offset?: number;
}): Promise<PaginatedPendingResult> {
  const query: Record<string, string | undefined> = {
    companyId: params?.companyId,
    search: params?.search,
    category: params?.category && params.category !== 'all' ? params.category : undefined,
    limit: params?.limit != null ? String(params.limit) : undefined,
    offset: params?.offset != null ? String(params.offset) : undefined,
  };
  return apiGet<PaginatedPendingResult>('/workflow/approval-hub/pending', query);
}
