import { describe, expect, it } from 'vitest';
import type { ProbationDashboard } from './performance';

describe('performance api types', () => {
  it('accepts probation dashboard shape', () => {
    const dashboard: ProbationDashboard = {
      pendingReviews: [{
        id: 'rev-1',
        employeeId: 'emp-1',
        companyId: 'co-1',
        employeeName: 'Test User',
        daysRemaining: 7,
        probationStartDate: '2026-04-01',
        probationEndDate: '2026-07-01',
        outcome: 'pending',
        extendedUntil: null,
        notes: null,
        reviewedBy: null,
        reviewerName: null,
        reviewedAt: null,
        createdAt: '2026-04-01T00:00:00.000Z',
      }],
      endingSoon: [{
        employeeId: 'emp-1',
        employeeName: 'Test User',
        department: 'hr',
        position: 'staff',
        probationEndDate: '2026-07-01',
        daysRemaining: 7,
        pendingReviewId: 'rev-1',
      }],
    };
    expect(dashboard.pendingReviews).toHaveLength(1);
    expect(dashboard.endingSoon[0].pendingReviewId).toBe('rev-1');
  });
});
