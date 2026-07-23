import { EmployeePerformanceViewService } from './employee-performance-view.service';

describe('EmployeePerformanceViewService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  it('maps summary, goals, review history, and improvement items from delegated services', async () => {
    const kpiAssignments = {
      getEmployeeKpi: jest.fn().mockResolvedValue({
        employeeId: 'emp-1',
        companyId: 'co-1',
        assignments: [{
          id: 'assign-1',
          cycleId: 'kpi-cycle-1',
          cycleName: '2026 Q2 KPI',
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          employeeName: 'Somchai Test',
          templateId: 'template-1',
          templateName: 'Sales KPI',
          reviewerId: null,
          status: 'in_progress',
          score: {
            id: 'score-1',
            totalScore: 82.5,
            grade: 'B',
            employeeComment: null,
            reviewerComment: 'Improve follow-up speed',
            finalizedAt: null,
            items: [{
              id: 'item-1',
              metricId: 'metric-1',
              metricName: 'Sales target',
              rawValue: '85',
              score: 85,
              weight: 40,
            }, {
              id: 'item-2',
              metricId: 'metric-2',
              metricName: 'Customer satisfaction',
              rawValue: null,
              score: null,
              weight: 30,
            }],
          },
          createdAt: '2026-04-01T00:00:00.000Z',
        }],
      }),
    };
    const kpiTemplates = {
      getOrThrow: jest.fn().mockResolvedValue({
        id: 'template-1',
        metrics: [
          { id: 'metric-1', targetValue: '100' },
          { id: 'metric-2', targetValue: '90' },
        ],
      }),
    };
    const performanceReviews = {
      getEmployeeReviews: jest.fn().mockResolvedValue({
        employeeId: 'emp-1',
        companyId: 'co-1',
        reviews: [{
          id: 'review-1',
          cycleId: 'cycle-1',
          cycleName: '2026 H1',
          employeeId: 'emp-1',
          employeeCode: 'EMP001',
          employeeName: 'Somchai Test',
          kpiAssignmentId: 'assign-1',
          reviewerId: 'mgr-1',
          status: 'finalized',
          kpiScore: 82.5,
          leaderReviewScore: 80,
          selfReviewScore: 75,
          feedback360Score: null,
          finalScore: 78,
          grade: 'B',
          leaderComment: 'Keep improving communication',
          selfComment: null,
          finalizedAt: '2026-06-01T00:00:00.000Z',
          feedback360: [],
          createdAt: '2026-05-01T00:00:00.000Z',
          updatedAt: '2026-06-01T00:00:00.000Z',
        }],
      }),
    };
    const performance = {
      listProbationsForEmployee: jest.fn().mockResolvedValue([{
        id: 'prob-1',
        employeeId: 'emp-1',
        companyId: 'co-1',
        probationStartDate: '2026-01-01',
        probationEndDate: '2026-04-01',
        outcome: 'passed',
        extendedUntil: null,
        notes: 'Passed with conditions',
        reviewedBy: 'mgr-1',
        reviewerName: 'Manager One',
        reviewedAt: '2026-04-02T00:00:00.000Z',
        createdAt: '2026-01-01T00:00:00.000Z',
      }]),
    };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ employmentStatus: 'active' }),
        findMany: jest.fn().mockResolvedValue([{ id: 'mgr-1', firstName: 'Manager', lastName: 'One' }]),
      },
      performanceReviewCycle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new EmployeePerformanceViewService(
      kpiAssignments as never,
      kpiTemplates as never,
      performanceReviews as never,
      performance as never,
      prisma as never,
    );

    const result = await service.getEmployeePerformanceView(actor, 'emp-1', 'co-1');
    expect(kpiAssignments.getEmployeeKpi).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(performanceReviews.getEmployeeReviews).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(performance.listProbationsForEmployee).toHaveBeenCalledWith(actor, 'emp-1');
    expect(result.summary.currentKpiScore).toBe(82.5);
    expect(result.summary.latestReviewScore).toBe(78);
    expect(result.summary.goalsCompleted).toBe(1);
    expect(result.summary.goalsPending).toBe(1);
    expect(result.currentGoals[0].target).toBe('100');
    expect(result.reviewHistory[0].reviewerName).toBe('Manager One');
    expect(result.improvementItems.some((item) => item.type === 'probation')).toBe(true);
    expect(result.improvementItems.some((item) => item.type === 'kpi_review')).toBe(true);
  });
});
