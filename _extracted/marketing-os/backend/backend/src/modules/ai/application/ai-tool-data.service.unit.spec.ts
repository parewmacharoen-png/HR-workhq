// ============================================================================
// modules/ai/application/ai-tool-data.service.unit.spec.ts
// Owner Copilot data tools
// ============================================================================

import { AiToolDataService } from './ai-tool-data.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ReportingService } from '../../reporting/application/reporting.service';
import { CommissionExecutiveDashboardService } from '../../reporting/application/commission-executive-dashboard.service';
import { AiToolContextService } from './ai-tool-context.service';
import { RagRetrievalService } from '../../knowledge/application/rag-retrieval.service';

function buildService(
  reportingOverrides: Partial<ReportingService> = {},
  prismaOverrides: Partial<PrismaService> = {},
) {
  const reporting = {
    getExecutiveDashboard: jest.fn().mockResolvedValue({
      generatedAt: '2026-06-20T00:00:00.000Z',
      snapshotDate: '2026-06-20',
      headcount: { active: 100, probation: 5, terminatedMtd: 1 },
      attendance: { rate: 92, late: 3, absent: 2 },
      payroll: { totalGross: 500000, totalNet: 420000, cycleStatus: 'open' },
      finance: { revenue: 800000, expenses: 600000, net: 200000 },
      commission: { qualifiedRate: 85, onHold: 2 },
      workflows: { pending: 12, byType: { leave: 4, overtime: 3 } },
    }),
    getOwnerDashboard: jest.fn().mockResolvedValue({
      generatedAt: '2026-06-20T00:00:00.000Z',
      snapshotDate: '2026-06-20',
      companies: [
        { companyId: 'co-a', companyName: 'Alpha', revenuePosted: 500, expensePosted: 300, net: 200 },
        { companyId: 'co-b', companyName: 'Beta', revenuePosted: 400, expensePosted: 350, net: 50 },
      ],
      totals: { headcount: 100, pendingApprovals: 12, revenuePosted: 900, expensePosted: 650, net: 250 },
    }),
    getCompanyDashboard: jest.fn(),
    getRiskDashboard: jest.fn().mockResolvedValue({
      alerts: [{ severity: 'high', category: 'approval', message: '5 overdue', count: 5 }],
    }),
    ...reportingOverrides,
  };

  const prisma = {
    candidate: {
      count: jest.fn().mockResolvedValue(10),
      groupBy: jest.fn().mockResolvedValue([{ stage: 'screening', _count: { id: 4 } }]),
    },
    performanceCycle: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'cycle-1',
        periodStart: new Date('2026-06-01'),
        periodEnd: new Date('2026-06-30'),
      }),
    },
    team: { findMany: jest.fn().mockResolvedValue([]) },
    employeeAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    evaluation: { findMany: jest.fn().mockResolvedValue([]) },
    ...prismaOverrides,
  };

  const commissionDashboard = {
    getDashboard: jest.fn(),
  };

  const service = new AiToolDataService(
    prisma as unknown as PrismaService,
    reporting as unknown as ReportingService,
    commissionDashboard as unknown as CommissionExecutiveDashboardService,
    {} as AiToolContextService,
    {} as RagRetrievalService,
    {} as import('./employee-self-service-query.service').EmployeeSelfServiceQueryService,
    { getMyKpi: jest.fn(), getTeamKpi: jest.fn(), getCompanyKpi: jest.fn() } as unknown as import('../../marketing/application/marketing-kpi-query.service').MarketingKpiQueryService,
    { getLatestMyReport: jest.fn(), getReportAuditForAi: jest.fn() } as unknown as import('../../marketing/application/marketing-backoffice.service').MarketingBackOfficeService,
    {
      getMyExpenses: jest.fn(),
      getMyExpenseSummary: jest.fn(),
      getTeamExpenseSummaryForAi: jest.fn(),
      getCompanyExpenseSummaryForAi: jest.fn(),
      getMarketingRoi: jest.fn(),
    } as unknown as import('../../marketing/application/marketing-expense.service').MarketingExpenseService,
    {
      getPerformanceInsights: jest.fn(),
      getRiskAlerts: jest.fn(),
      getForecast: jest.fn(),
      getTeamComparison: jest.fn(),
    } as unknown as import('../../marketing/application/marketing-insight.service').MarketingInsightService,
    {
      listCycles: jest.fn(),
      getCycleStatus: jest.fn(),
      previewCycle: jest.fn(),
      ensureBatchCycle: jest.fn(),
    } as unknown as import('../../commission/application/commission-finalization.service').CommissionFinalizationService,
    {
      getAdjustments: jest.fn(),
      getAdjustmentHistory: jest.fn(),
    } as unknown as import('../../commission/application/commission-adjustment.service').CommissionAdjustmentService,
    {
      getExecutiveSummary: jest.fn().mockResolvedValue({
        scope: { companyId: null, scope: 'all_companies', snapshotDate: '2026-06-20' },
        generatedAt: '2026-06-20T00:00:00.000Z',
        headline: {
          headcountActive: 100,
          attendanceRate: 92,
          financeNet: 200000,
          payrollNet: 420000,
          pendingApprovals: 12,
          riskAlertCount: 1,
          commissionOnHold: 2,
        },
        finance: { revenue: 800000, expenses: 600000, net: 200000 },
        payroll: { totalGross: 500000, totalNet: 420000, cycleStatus: 'open' },
        attendance: { rate: 92, late: 3, absent: 2 },
        headcount: { active: 100, probation: 5, terminatedMtd: 1 },
        leave: { pendingRequests: 0, approvedMtd: 0, rejectedMtd: 0 },
        marketing: null,
        commission: null,
        workflows: { pending: 12, byType: { leave: 4 } },
      }),
      getExecutiveRisks: jest.fn().mockResolvedValue({
        risks: [{ severity: 'high', category: 'approval', message: '5 overdue', count: 5 }],
      }),
      getExecutiveForecast: jest.fn(),
      getExecutiveRecommendations: jest.fn(),
    } as unknown as import('../../reporting/application/executive-insight.service').ExecutiveInsightService,
  );

  return { service, reporting, prisma, commissionDashboard };
}

describe('AiToolDataService — Owner Copilot', () => {
  const ctx = { employeeId: null, companyId: '' };
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: null };

  it('get_executive_summary aggregates reporting domains', async () => {
    const { service, reporting, prisma } = buildService();
    (prisma.evaluation.findMany as jest.Mock).mockResolvedValue([
      { totalScore: 75, status: 'draft' },
    ]);

    const result = await service.fetch('get_executive_summary', ctx, {}, actor);

    expect(result).toMatchObject({
      scope: 'all_companies',
      headline: {
        headcountActive: 100,
        financeNet: 200000,
        riskAlertCount: 1,
      },
      finance: { net: 200000 },
      payroll: { totalNet: 420000 },
      topRisks: [{ severity: 'high' }],
    });
    expect(reporting.getOwnerDashboard).toHaveBeenCalled();
  });

  it('get_company_profit_ranking ranks companies by net profit', async () => {
    const { service } = buildService();

    const result = await service.fetch('get_company_profit_ranking', ctx) as {
      topPerformer: { companyName: string; net: number };
      companies: Array<{ rank: number; companyName: string }>;
    };

    expect(result.topPerformer).toEqual({
      rank: 1,
      companyId: 'co-a',
      companyName: 'Alpha',
      net: 200,
      revenuePosted: 500,
      expensePosted: 300,
    });
    expect(result.companies[0]?.companyName).toBe('Alpha');
    expect(result.companies[1]?.companyName).toBe('Beta');
  });

  it('get_team_performance_rankings surfaces underperforming teams', async () => {
    const { service, prisma } = buildService({}, {
      team: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'team-low',
            name: 'Sales B',
            companyId: 'co-a',
            company: { name: 'Alpha', code: 'A' },
          },
          {
            id: 'team-high',
            name: 'Sales A',
            companyId: 'co-a',
            company: { name: 'Alpha', code: 'A' },
          },
        ]),
      } as unknown as PrismaService['team'],
      employeeAssignment: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ employeeId: 'e1' }, { employeeId: 'e2' }])
          .mockResolvedValueOnce([{ employeeId: 'e3' }]),
      } as unknown as PrismaService['employeeAssignment'],
      evaluation: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{ totalScore: 45 }, { totalScore: 50 }])
          .mockResolvedValueOnce([{ totalScore: 90 }]),
      } as unknown as PrismaService['evaluation'],
    });

    const result = await service.fetch('get_team_performance_rankings', ctx, { bottomN: 1 }) as {
      underperformingTeams: Array<{ teamName: string; averageScore: number }>;
      topTeams: Array<{ teamName: string; averageScore: number }>;
    };

    expect(result.underperformingTeams[0]?.teamName).toBe('Sales B');
    expect(result.underperformingTeams[0]?.averageScore).toBe(47.5);
    expect(result.topTeams[0]?.teamName).toBe('Sales A');
    expect(result.topTeams[0]?.averageScore).toBe(90);
  });
});
