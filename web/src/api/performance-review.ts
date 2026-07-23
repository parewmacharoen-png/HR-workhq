import { apiDelete, apiGet, apiPatch, apiPost } from './client';
import type { KpiCycleStatus } from './kpi';

export type PerformanceConfigStatus = 'draft' | 'active' | 'archived';
export type PerformanceReviewStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'reviewed'
  | 'finalized'
  | 'cancelled';

export interface PerformanceWeightProfile {
  id: string;
  companyId: string;
  name: string;
  kpiWeight: number;
  leaderReviewWeight: number;
  selfReviewWeight: number;
  feedback360Weight: number;
  isDefault: boolean;
  status: PerformanceConfigStatus;
  version: number;
  rootId: string | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceReviewCycle {
  id: string;
  companyId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  weightProfileId: string;
  weightProfileName?: string;
  status: KpiCycleStatus;
  reviewCount?: number;
  createdAt: string;
}

export interface PerformanceReview360Feedback {
  id: string;
  reviewerId: string;
  reviewerName?: string;
  score: number;
  comment: string | null;
  createdAt: string;
}

export interface PerformanceScoreBreakdown {
  kpiScore: number | null;
  leaderReviewScore: number | null;
  selfReviewScore: number | null;
  feedback360Score: number | null;
  finalScore: number | null;
  grade: string | null;
  kpiWeight: number;
  leaderReviewWeight: number;
  selfReviewWeight: number;
  feedback360Weight: number;
}

export interface PerformanceReview {
  id: string;
  cycleId: string;
  cycleName?: string;
  employeeId: string;
  employeeCode?: string;
  employeeName?: string;
  kpiAssignmentId: string | null;
  reviewerId: string | null;
  status: PerformanceReviewStatus;
  kpiScore: number | null;
  leaderReviewScore: number | null;
  selfReviewScore: number | null;
  feedback360Score: number | null;
  finalScore: number | null;
  grade: string | null;
  leaderComment: string | null;
  selfComment: string | null;
  finalizedAt: string | null;
  breakdown?: PerformanceScoreBreakdown;
  feedback360?: PerformanceReview360Feedback[];
  createdAt: string;
}

export interface PerformanceDashboard {
  companyId: string;
  activeCycles: PerformanceReviewCycle[];
  pendingReviews: PerformanceReview[];
  submittedReviews: PerformanceReview[];
  recentlyFinalized: PerformanceReview[];
}

export interface EmployeePerformanceReviews {
  employeeId: string;
  companyId: string;
  reviews: PerformanceReview[];
}

export function fetchWeightProfiles(companyId: string): Promise<PerformanceWeightProfile[]> {
  return apiGet<PerformanceWeightProfile[]>('/performance/weight-profiles', { companyId });
}

export function createWeightProfile(body: {
  companyId: string;
  name: string;
  kpiWeight: number;
  leaderReviewWeight: number;
  selfReviewWeight: number;
  feedback360Weight: number;
  isDefault?: boolean;
}): Promise<PerformanceWeightProfile> {
  return apiPost<PerformanceWeightProfile>('/performance/weight-profiles', body);
}

export function updateWeightProfile(
  id: string,
  body: Partial<{
    name: string;
    kpiWeight: number;
    leaderReviewWeight: number;
    selfReviewWeight: number;
    feedback360Weight: number;
    isDefault: boolean;
    status: PerformanceConfigStatus;
  }>,
): Promise<PerformanceWeightProfile> {
  return apiPatch<PerformanceWeightProfile>(`/performance/weight-profiles/${id}`, body);
}

export function deleteWeightProfile(id: string): Promise<void> {
  return apiDelete<void>(`/performance/weight-profiles/${id}`);
}

export function archiveWeightProfile(id: string): Promise<PerformanceWeightProfile> {
  return apiPost<PerformanceWeightProfile>(`/performance/weight-profiles/${id}/archive`, {});
}

export function cloneWeightProfile(id: string): Promise<PerformanceWeightProfile> {
  return apiPost<PerformanceWeightProfile>(`/performance/weight-profiles/${id}/clone`, {});
}

export function versionWeightProfile(id: string): Promise<PerformanceWeightProfile> {
  return apiPost<PerformanceWeightProfile>(`/performance/weight-profiles/${id}/version`, {});
}

export function fetchReviewCycles(companyId: string): Promise<PerformanceReviewCycle[]> {
  return apiGet<PerformanceReviewCycle[]>('/performance/review-cycles', { companyId });
}

export function createReviewCycle(body: {
  companyId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  weightProfileId: string;
}): Promise<PerformanceReviewCycle> {
  return apiPost<PerformanceReviewCycle>('/performance/review-cycles', body);
}

export function assignReviewCycle(
  cycleId: string,
  body: { employeeIds: string[]; reviewerId?: string },
): Promise<PerformanceReview[]> {
  return apiPost<PerformanceReview[]>(`/performance/review-cycles/${cycleId}/assign`, body);
}

export function fetchCycleReviews(cycleId: string): Promise<PerformanceReview[]> {
  return apiGet<PerformanceReview[]>(`/performance/review-cycles/${cycleId}/reviews`);
}

export function fetchEmployeePerformanceReviews(
  employeeId: string,
  companyId?: string,
): Promise<EmployeePerformanceReviews> {
  return apiGet<EmployeePerformanceReviews>(`/employees/${employeeId}/performance-reviews`, { companyId });
}

export function updateReviewScores(
  reviewId: string,
  body: {
    leaderReviewScore?: number;
    selfReviewScore?: number;
    leaderComment?: string;
    selfComment?: string;
  },
): Promise<PerformanceReview> {
  return apiPatch<PerformanceReview>(`/performance/reviews/${reviewId}/scores`, body);
}

export function add360Feedback(
  reviewId: string,
  body: { score: number; comment?: string },
): Promise<PerformanceReview360Feedback> {
  return apiPost<PerformanceReview360Feedback>(`/performance/reviews/${reviewId}/360-feedback`, body);
}

export function submitPerformanceReview(reviewId: string): Promise<PerformanceReview> {
  return apiPost<PerformanceReview>(`/performance/reviews/${reviewId}/submit`, {});
}

export function finalizePerformanceReview(reviewId: string): Promise<PerformanceReview> {
  return apiPost<PerformanceReview>(`/performance/reviews/${reviewId}/finalize`, {});
}

export function fetchPerformanceDashboard(companyId: string): Promise<PerformanceDashboard> {
  return apiGet<PerformanceDashboard>('/performance/dashboard', { companyId });
}
