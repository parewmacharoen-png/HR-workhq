import { apiGet, apiPatch, apiPost } from './client';

export type CompensationReviewStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'applied';

export interface SalaryReviewRecord {
  id: string;
  employeeId: string;
  companyId: string;
  employeeCode: string;
  employeeName: string;
  currentSalary: number;
  proposedSalary: number;
  increaseAmount: number;
  increasePercent: number;
  reason: string | null;
  effectiveDate: string;
  status: CompensationReviewStatus;
}

export interface PromotionReviewRecord {
  id: string;
  employeeId: string;
  companyId: string;
  employeeCode: string;
  employeeName: string;
  currentPosition: string | null;
  proposedPosition: string;
  reason: string | null;
  effectiveDate: string;
  status: CompensationReviewStatus;
}

export interface CompensationDashboard {
  companyId: string;
  pendingSalaryReviews: SalaryReviewRecord[];
  pendingPromotionReviews: PromotionReviewRecord[];
  upcomingSalaryChanges: SalaryReviewRecord[];
  upcomingPromotionChanges: PromotionReviewRecord[];
}

export interface LatestKpiScoreSummary {
  assignmentId: string;
  cycleName: string;
  templateName: string;
  totalScore: number | null;
  grade: string | null;
  finalizedAt: string;
}

export interface CompensationTimeline {
  employeeId: string;
  companyId: string | null;
  hireDate: string | null;
  currentSalary: number;
  currentPosition: string | null;
  salaryHistory: Array<{
    id: string;
    monthlySalary: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: string | null;
  }>;
  salaryReviews: SalaryReviewRecord[];
  promotionReviews: PromotionReviewRecord[];
  pendingSalaryReviews: SalaryReviewRecord[];
  pendingPromotionReviews: PromotionReviewRecord[];
  latestKpiScore?: LatestKpiScoreSummary | null;
}

export type CompensationReviewListType = 'salary' | 'promotion';

export interface CompensationReviewListItem {
  id: string;
  type: CompensationReviewListType;
  employeeId: string;
  companyId: string;
  employeeCode: string;
  employeeName: string;
  currentValue: string;
  proposedValue: string;
  increaseAmount: number | null;
  increasePercent: number | null;
  effectiveDate: string;
  status: CompensationReviewStatus;
  requestedBy: string | null;
  requestedByName: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface CompensationReviewListResponse {
  companyId: string;
  items: CompensationReviewListItem[];
  total: number;
}

export interface CompensationListFilters {
  companyId: string;
  type?: 'salary' | 'promotion' | 'all';
  status?: CompensationReviewStatus;
  effectiveFrom?: string;
  effectiveTo?: string;
  search?: string;
}

export function fetchCompensationDashboard(companyId: string): Promise<CompensationDashboard> {
  return apiGet<CompensationDashboard>('/compensation-reviews/dashboard', { companyId });
}

export function fetchCompensationReviewList(filters: CompensationListFilters): Promise<CompensationReviewListResponse> {
  const { companyId, type, status, effectiveFrom, effectiveTo, search } = filters;
  return apiGet<CompensationReviewListResponse>('/compensation-reviews/list', {
    companyId,
    type,
    status,
    effectiveFrom,
    effectiveTo,
    search,
  });
}

export function fetchCompensationTimeline(employeeId: string, companyId?: string): Promise<CompensationTimeline> {
  return apiGet<CompensationTimeline>(`/employees/${employeeId}/compensation-timeline`, { companyId });
}

export function createSalaryReview(body: {
  employeeId: string;
  companyId: string;
  proposedSalary: number;
  effectiveDate: string;
  reason?: string;
  note?: string;
}): Promise<SalaryReviewRecord> {
  return apiPost<SalaryReviewRecord>('/salary-reviews', body);
}

export function submitSalaryReview(id: string): Promise<SalaryReviewRecord> {
  return apiPost<SalaryReviewRecord>(`/salary-reviews/${id}/submit`, {});
}

export function approveSalaryReview(id: string): Promise<SalaryReviewRecord> {
  return apiPost<SalaryReviewRecord>(`/salary-reviews/${id}/approve`, {});
}

export function rejectSalaryReview(id: string, reason?: string): Promise<SalaryReviewRecord> {
  return apiPost<SalaryReviewRecord>(`/salary-reviews/${id}/reject`, { reason });
}

export function applySalaryReview(id: string): Promise<SalaryReviewRecord> {
  return apiPost<SalaryReviewRecord>(`/salary-reviews/${id}/apply`, {});
}

export function createPromotionReview(body: {
  employeeId: string;
  companyId: string;
  proposedPosition: string;
  effectiveDate: string;
  reason?: string;
  note?: string;
}): Promise<PromotionReviewRecord> {
  return apiPost<PromotionReviewRecord>('/promotion-reviews', body);
}

export function submitPromotionReview(id: string): Promise<PromotionReviewRecord> {
  return apiPost<PromotionReviewRecord>(`/promotion-reviews/${id}/submit`, {});
}

export function approvePromotionReview(id: string): Promise<PromotionReviewRecord> {
  return apiPost<PromotionReviewRecord>(`/promotion-reviews/${id}/approve`, {});
}

export function rejectPromotionReview(id: string, reason?: string): Promise<PromotionReviewRecord> {
  return apiPost<PromotionReviewRecord>(`/promotion-reviews/${id}/reject`, { reason });
}

export function applyPromotionReview(id: string): Promise<PromotionReviewRecord> {
  return apiPost<PromotionReviewRecord>(`/promotion-reviews/${id}/apply`, {});
}

export function updateSalaryReview(
  id: string,
  body: { proposedSalary?: number; effectiveDate?: string; reason?: string; note?: string },
): Promise<SalaryReviewRecord> {
  return apiPatch<SalaryReviewRecord>(`/salary-reviews/${id}`, body);
}

export function updatePromotionReview(
  id: string,
  body: { proposedPosition?: string; effectiveDate?: string; reason?: string; note?: string },
): Promise<PromotionReviewRecord> {
  return apiPatch<PromotionReviewRecord>(`/promotion-reviews/${id}`, body);
}

export async function createAndSubmitSalaryReview(body: Parameters<typeof createSalaryReview>[0]): Promise<SalaryReviewRecord> {
  const draft = await createSalaryReview(body);
  return submitSalaryReview(draft.id);
}

export async function createAndSubmitPromotionReview(body: Parameters<typeof createPromotionReview>[0]): Promise<PromotionReviewRecord> {
  const draft = await createPromotionReview(body);
  return submitPromotionReview(draft.id);
}
