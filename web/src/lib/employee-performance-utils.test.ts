import { describe, expect, it } from 'vitest';
import type { EmployeePerformanceReviewHistoryItem } from '../api/employee-performance';
import {
  filterPerformanceReviewHistory,
  formatPerformanceScore,
  performanceReviewStatusLabel,
  performanceYearOptions,
} from './employee-performance-utils';

const history: EmployeePerformanceReviewHistoryItem[] = [{
  id: 'review-1',
  cycleId: 'cycle-1',
  period: '2026 H1',
  reviewType: 'performance_review',
  kpiScore: 82.5,
  reviewScore: 78,
  status: 'finalized',
  reviewerName: 'Manager One',
  completedDate: '2026-06-01',
}, {
  id: 'review-2',
  cycleId: 'cycle-2',
  period: '2025 H2',
  reviewType: 'performance_review',
  kpiScore: 70,
  reviewScore: 72,
  status: 'draft',
  reviewerName: 'Manager Two',
  completedDate: '2025-12-01',
}];

describe('employee-performance-utils', () => {
  it('formats performance score', () => {
    expect(formatPerformanceScore(82.5)).toBe('82.5');
    expect(formatPerformanceScore(null)).toBe('—');
  });

  it('labels review status', () => {
    expect(performanceReviewStatusLabel('finalized')).toBe('สรุปแล้ว');
  });

  it('builds year options from history', () => {
    expect(performanceYearOptions(history, 2026)).toEqual(['2026', '2025']);
  });

  it('filters review history by year, status, and search', () => {
    expect(filterPerformanceReviewHistory(history, {
      year: '2025',
      reviewType: '',
      status: '',
      search: '',
    })).toHaveLength(1);
    expect(filterPerformanceReviewHistory(history, {
      year: '',
      reviewType: 'performance_review',
      status: 'draft',
      search: 'Manager Two',
    })).toHaveLength(1);
  });
});
