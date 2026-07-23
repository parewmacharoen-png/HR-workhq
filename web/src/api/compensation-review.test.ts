import { describe, expect, it } from 'vitest';
import {
  applyPromotionReview,
  applySalaryReview,
  approvePromotionReview,
  approveSalaryReview,
  createAndSubmitPromotionReview,
  createAndSubmitSalaryReview,
  createPromotionReview,
  createSalaryReview,
  fetchCompensationDashboard,
  fetchCompensationReviewList,
  fetchCompensationTimeline,
  rejectSalaryReview,
  submitSalaryReview,
} from './compensation-review';

describe('compensation review API client', () => {
  it('exports workflow helpers', () => {
    expect(typeof fetchCompensationDashboard).toBe('function');
    expect(typeof fetchCompensationReviewList).toBe('function');
    expect(typeof fetchCompensationTimeline).toBe('function');
    expect(typeof createSalaryReview).toBe('function');
    expect(typeof createAndSubmitSalaryReview).toBe('function');
    expect(typeof submitSalaryReview).toBe('function');
    expect(typeof approveSalaryReview).toBe('function');
    expect(typeof rejectSalaryReview).toBe('function');
    expect(typeof applySalaryReview).toBe('function');
    expect(typeof createPromotionReview).toBe('function');
    expect(typeof createAndSubmitPromotionReview).toBe('function');
    expect(typeof approvePromotionReview).toBe('function');
    expect(typeof applyPromotionReview).toBe('function');
  });
});
