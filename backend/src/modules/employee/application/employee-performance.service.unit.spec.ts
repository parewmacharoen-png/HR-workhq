import { EmployeePerformanceService } from './employee-performance.service';
import { EmployeePerformanceViewService } from '../../performance-review/application/employee-performance-view.service';

describe('EmployeePerformanceService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  it('delegates to EmployeePerformanceViewService without duplicating calculations', async () => {
    const view = {
      summary: {
        currentKpiScore: 82.5,
        latestReviewScore: 78,
        latestReviewPeriod: '2026 H1',
        reviewStatus: 'finalized',
        probationStatus: 'ผ่านทดลองงานแล้ว',
        probationStatusCode: 'passed',
        nextReviewDue: '2026-12-31',
        goalsCompleted: 2,
        goalsPending: 1,
        warningsCount: 0,
      },
      currentGoals: [{
        id: 'metric-1',
        name: 'Sales target',
        target: '100',
        actual: '85',
        progress: 85,
        weight: 40,
        status: 'in_progress',
      }],
      reviewHistory: [{
        id: 'review-1',
        cycleId: 'cycle-1',
        period: '2026 H1',
        reviewType: 'performance_review' as const,
        kpiScore: 82.5,
        reviewScore: 78,
        status: 'finalized',
        reviewerName: 'Manager One',
        completedDate: '2026-06-01',
      }],
      improvementItems: [],
    };

    const performanceView = {
      getEmployeePerformanceView: jest.fn().mockResolvedValue(view),
    };
    const employeeAccess = {
      assertEmployeeReadable: jest.fn(),
    };

    const service = new EmployeePerformanceService(
      performanceView as unknown as EmployeePerformanceViewService,
      employeeAccess as never,
    );

    const result = await service.getPerformance(actor, 'emp-1', 'co-1');
    expect(employeeAccess.assertEmployeeReadable).toHaveBeenCalledWith(actor, 'emp-1');
    expect(performanceView.getEmployeePerformanceView).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(result.summary.currentKpiScore).toBe(82.5);
    expect(result.reviewHistory[0].reviewScore).toBe(78);
  });
});
