import { describe, expect, it } from 'vitest';
import {
  add360Feedback,
  archiveWeightProfile,
  assignReviewCycle,
  cloneWeightProfile,
  createReviewCycle,
  createWeightProfile,
  deleteWeightProfile,
  fetchCycleReviews,
  fetchEmployeePerformanceReviews,
  fetchPerformanceDashboard,
  fetchReviewCycles,
  fetchWeightProfiles,
  finalizePerformanceReview,
  submitPerformanceReview,
  updateReviewScores,
  updateWeightProfile,
  versionWeightProfile,
} from './performance-review';

describe('performance-review API client', () => {
  it('exports workflow helpers', () => {
    expect(typeof fetchWeightProfiles).toBe('function');
    expect(typeof createWeightProfile).toBe('function');
    expect(typeof updateWeightProfile).toBe('function');
    expect(typeof deleteWeightProfile).toBe('function');
    expect(typeof archiveWeightProfile).toBe('function');
    expect(typeof cloneWeightProfile).toBe('function');
    expect(typeof versionWeightProfile).toBe('function');
    expect(typeof fetchReviewCycles).toBe('function');
    expect(typeof createReviewCycle).toBe('function');
    expect(typeof assignReviewCycle).toBe('function');
    expect(typeof fetchCycleReviews).toBe('function');
    expect(typeof fetchEmployeePerformanceReviews).toBe('function');
    expect(typeof updateReviewScores).toBe('function');
    expect(typeof add360Feedback).toBe('function');
    expect(typeof submitPerformanceReview).toBe('function');
    expect(typeof finalizePerformanceReview).toBe('function');
    expect(typeof fetchPerformanceDashboard).toBe('function');
  });
});
