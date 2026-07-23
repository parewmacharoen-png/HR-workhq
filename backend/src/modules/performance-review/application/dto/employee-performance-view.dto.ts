export interface EmployeePerformanceSummaryDto {
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

export interface EmployeePerformanceGoalDto {
  id: string;
  name: string;
  target: string | null;
  actual: string | null;
  progress: number | null;
  weight: number;
  status: string;
}

export type EmployeePerformanceReviewType = 'performance_review';

export interface EmployeePerformanceReviewHistoryItemDto {
  id: string;
  cycleId: string;
  period: string;
  reviewType: EmployeePerformanceReviewType;
  kpiScore: number | null;
  reviewScore: number | null;
  status: string;
  reviewerName: string | null;
  completedDate: string | null;
}

export type EmployeePerformanceImprovementType = 'probation' | 'kpi_review' | 'review_comment';

export interface EmployeePerformanceImprovementItemDto {
  id: string;
  type: EmployeePerformanceImprovementType;
  title: string;
  description: string | null;
  date: string | null;
}

export interface EmployeePerformanceViewDto {
  summary: EmployeePerformanceSummaryDto;
  currentGoals: EmployeePerformanceGoalDto[];
  reviewHistory: EmployeePerformanceReviewHistoryItemDto[];
  improvementItems: EmployeePerformanceImprovementItemDto[];
}
