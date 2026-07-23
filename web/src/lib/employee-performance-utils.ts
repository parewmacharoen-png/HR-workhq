import type {
  EmployeePerformanceReviewHistoryItem,
} from '../api/employee-performance';

export const PERFORMANCE_REVIEW_STATUS_LABELS: Record<string, string> = {
  draft: 'ร่าง',
  in_progress: 'กำลังดำเนินการ',
  submitted: 'ส่งแล้ว',
  reviewed: 'ตรวจแล้ว',
  finalized: 'สรุปแล้ว',
  cancelled: 'ยกเลิก',
};

export const PERFORMANCE_REVIEW_TYPE_LABELS: Record<string, string> = {
  performance_review: 'ประเมินผลงาน',
};

export const KPI_ASSIGNMENT_STATUS_LABELS: Record<string, string> = {
  pending: 'รอดำเนินการ',
  in_progress: 'กำลังดำเนินการ',
  submitted: 'ส่งแล้ว',
  reviewed: 'ตรวจแล้ว',
  finalized: 'สรุปแล้ว',
};

export function performanceReviewStatusLabel(status: string): string {
  return PERFORMANCE_REVIEW_STATUS_LABELS[status] ?? status;
}

export function performanceReviewStatusVariant(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'finalized':
      return 'success';
    case 'reviewed':
    case 'submitted':
      return 'info';
    case 'in_progress':
      return 'warning';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function performanceReviewTypeLabel(type: string): string {
  return PERFORMANCE_REVIEW_TYPE_LABELS[type] ?? type;
}

export function kpiGoalStatusLabel(status: string): string {
  return KPI_ASSIGNMENT_STATUS_LABELS[status] ?? status;
}

export function formatPerformanceScore(score: number | null | undefined): string {
  if (score == null) return '—';
  return score.toFixed(1);
}

export function filterPerformanceReviewHistory(
  items: EmployeePerformanceReviewHistoryItem[],
  filters: { year: string; reviewType: string; status: string; search: string },
): EmployeePerformanceReviewHistoryItem[] {
  const query = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.year) {
      const year = item.completedDate?.slice(0, 4)
        ?? item.period.match(/\d{4}/)?.[0]
        ?? '';
      if (year !== filters.year) return false;
    }
    if (filters.reviewType && item.reviewType !== filters.reviewType) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (!query) return true;
    const haystack = [
      item.period,
      item.reviewType,
      item.status,
      item.reviewerName ?? '',
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function performanceYearOptions(
  items: EmployeePerformanceReviewHistoryItem[],
  fallbackYear: number,
): string[] {
  const years = new Set<string>();
  for (const item of items) {
    if (item.completedDate) years.add(item.completedDate.slice(0, 4));
    const match = item.period.match(/\d{4}/);
    if (match) years.add(match[0]);
  }
  years.add(String(fallbackYear));
  return [...years].sort((a, b) => Number(b) - Number(a));
}
