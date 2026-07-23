import { apiGet } from './client';

export interface EmployeePerformanceSummary {
  currentKpiScore: number | null;
  latestReviewScore: number | null;
  latestReviewPeriod: string | null;
  reviewStatus: string | null;
  probationStatus: string;
  probationStatusCode: string;
  nextReviewDue: string | null;
  goalsCompleted: number;
  goalsPending: number;
  warningsCount: number;
}

export interface EmployeePerformanceGoal {
  id: string;
  name: string;
  target: string | null;
  actual: string | null;
  progress: number | null;
  weight: number;
  status: string;
}

export interface EmployeePerformanceReviewHistoryItem {
  id: string;
  cycleId: string;
  period: string;
  reviewType: 'performance_review';
  kpiScore: number | null;
  reviewScore: number | null;
  status: string;
  reviewerName: string | null;
  completedDate: string | null;
}

export interface EmployeePerformanceImprovementItem {
  id: string;
  type: 'probation' | 'kpi_review' | 'review_comment';
  title: string;
  description: string | null;
  date: string | null;
}

export interface EmployeePerformanceResponse {
  summary: EmployeePerformanceSummary;
  currentGoals: EmployeePerformanceGoal[];
  reviewHistory: EmployeePerformanceReviewHistoryItem[];
  improvementItems: EmployeePerformanceImprovementItem[];
}

export function fetchEmployeePerformance(employeeId: string, companyId: string) {
  return apiGet<EmployeePerformanceResponse>(
    `/employees/${employeeId}/performance?companyId=${encodeURIComponent(companyId)}`,
  );
}
