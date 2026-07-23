import { apiGet, apiPatch, apiPost } from './client';

export interface ProbationReviewRecord {
  id: string;
  employeeId: string;
  companyId: string;
  probationStartDate: string;
  probationEndDate: string;
  outcome: string;
  extendedUntil: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface CreateProbationReviewInput {
  employeeId: string;
  companyId: string;
  probationStartDate: string;
  probationEndDate: string;
  notes?: string;
}

export interface ResolveProbationInput {
  outcome: 'PASS' | 'EXTEND' | 'FAIL' | 'passed' | 'extended' | 'failed';
  extendedUntil?: string;
  extensionDays?: number;
  notes?: string;
}

export async function fetchEmployeeProbationReviews(employeeId: string): Promise<ProbationReviewRecord[]> {
  return apiGet<ProbationReviewRecord[]>(`/performance/employees/${employeeId}/probation`);
}

export async function createProbationReview(input: CreateProbationReviewInput): Promise<ProbationReviewRecord> {
  return apiPost<ProbationReviewRecord>('/performance/probation', input);
}

export async function resolveProbationReview(
  reviewId: string,
  input: ResolveProbationInput,
): Promise<ProbationReviewRecord> {
  return apiPatch<ProbationReviewRecord>(`/performance/probation/${reviewId}/resolve`, input);
}

export interface ProbationDashboardReviewItem extends ProbationReviewRecord {
  employeeName: string;
  daysRemaining: number;
}

export interface ProbationEndingSoonItem {
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  probationEndDate: string;
  daysRemaining: number;
  pendingReviewId: string | null;
}

export interface ProbationDashboard {
  pendingReviews: ProbationDashboardReviewItem[];
  endingSoon: ProbationEndingSoonItem[];
}

export async function fetchPendingProbationReviews(companyId: string): Promise<ProbationReviewRecord[]> {
  return apiGet<ProbationReviewRecord[]>('/performance/probation/pending', { companyId });
}

export async function fetchProbationDashboard(companyId: string): Promise<ProbationDashboard> {
  return apiGet<ProbationDashboard>('/performance/probation/dashboard', { companyId });
}
