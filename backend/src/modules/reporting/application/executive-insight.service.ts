// ============================================================================
// ExecutiveInsightService — company-wide read-only business intelligence
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { MarketingInsightService } from '../../marketing/application/marketing-insight.service';
import { MarketingTeamService } from '../../marketing/application/marketing-team.service';
import { ReportingService } from './reporting.service';
import { CommissionExecutiveDashboardService } from './commission-executive-dashboard.service';
import {
  ExecutiveForecastPayload,
  ExecutiveInsightScope,
  ExecutiveRecommendationsPayload,
  ExecutiveRisksPayload,
  ExecutiveSummaryPayload,
} from './dto/executive-insight.dto';
import {
  buildExecutiveForecast,
  buildExecutiveHeadline,
  buildExecutiveOpportunities,
  buildExecutiveRecommendations,
  buildExecutiveRisks,
} from '../domain/services/executive-insight.builder';
import { ExecutiveAccessDeniedError } from '../domain/errors/executive.errors';

interface ExecutiveQuery {
  companyId?: string;
}

type DashboardPayload = {
  generatedAt?: string;
  snapshotDate?: string;
  headcount?: { active: number; probation: number; terminatedMtd: number };
  attendance?: { rate: number; late: number; absent: number };
  payroll?: { totalGross: number; totalNet: number; cycleStatus: string };
  finance?: { revenue: number; expenses: number; net: number };
  commission?: { qualifiedRate: number; onHold: number };
  workflows?: { pending: number; byType: Record<string, number> };
};

@Injectable()
export class ExecutiveInsightService {
  constructor(
    private readonly reporting: ReportingService,
    private readonly commissionDashboard: CommissionExecutiveDashboardService,
    private readonly marketingInsights: MarketingInsightService,
    private readonly marketingTeamService: MarketingTeamService,
    private readonly companyAccess: CompanyAccessService,
    private readonly prisma: PrismaService,
  ) {}

  async getExecutiveSummary(
    actor: ActorContext,
    query: ExecutiveQuery = {},
  ): Promise<ExecutiveSummaryPayload> {
    const scope = await this.resolveScope(actor, query.companyId);
    const context = await this.loadContext(actor, scope);
    const headline = buildExecutiveHeadline({
      headcountActive: context.dashboard.headcount?.active ?? 0,
      attendanceRate: context.dashboard.attendance?.rate ?? 0,
      financeNet: context.dashboard.finance?.net ?? 0,
      payrollNet: context.dashboard.payroll?.totalNet ?? 0,
      pendingApprovals: context.dashboard.workflows?.pending ?? 0,
      riskAlertCount: context.risks.length,
      commissionOnHold: context.dashboard.commission?.onHold ?? context.commissionSummary?.totalHold ?? 0,
    });

    return {
      scope,
      generatedAt: context.dashboard.generatedAt ?? new Date().toISOString(),
      headline,
      finance: context.dashboard.finance ?? null,
      payroll: context.dashboard.payroll ?? null,
      attendance: context.dashboard.attendance ?? null,
      headcount: context.dashboard.headcount ?? null,
      leave: context.leave,
      marketing: context.marketing,
      commission: context.commissionSummary,
      workflows: context.dashboard.workflows ?? null,
    };
  }

  async getExecutiveRisks(
    actor: ActorContext,
    query: ExecutiveQuery = {},
  ): Promise<ExecutiveRisksPayload> {
    const scope = await this.resolveScope(actor, query.companyId);
    const context = await this.loadContext(actor, scope);
    return {
      scope,
      risks: buildExecutiveRisks({
        alerts: context.riskAlerts,
        commissionOnHold: context.dashboard.commission?.onHold ?? 0,
        pendingApprovals: context.dashboard.workflows?.pending ?? 0,
        attendanceRate: context.dashboard.attendance?.rate ?? 0,
        marketingAtRiskCount: context.marketingAtRiskCount,
        pendingAdjustments: context.pendingAdjustments,
      }),
    };
  }

  async getExecutiveForecast(
    actor: ActorContext,
    query: ExecutiveQuery = {},
  ): Promise<ExecutiveForecastPayload> {
    const scope = await this.resolveScope(actor, query.companyId);
    const context = await this.loadContext(actor, scope);
    return {
      scope,
      forecast: buildExecutiveForecast({
        financeNet: context.dashboard.finance?.net ?? null,
        payrollNet: context.dashboard.payroll?.totalNet ?? null,
        commissionPending: context.commissionSummary?.totalPending ?? null,
        marketingExpense: context.marketing?.totalExpense ?? null,
        marketingStartedWork: context.marketingStartedWork,
      }),
    };
  }

  async getExecutiveRecommendations(
    actor: ActorContext,
    query: ExecutiveQuery = {},
  ): Promise<ExecutiveRecommendationsPayload> {
    const scope = await this.resolveScope(actor, query.companyId);
    const context = await this.loadContext(actor, scope);
    const risks = buildExecutiveRisks({
      alerts: context.riskAlerts,
      commissionOnHold: context.dashboard.commission?.onHold ?? 0,
      pendingApprovals: context.dashboard.workflows?.pending ?? 0,
      attendanceRate: context.dashboard.attendance?.rate ?? 0,
      marketingAtRiskCount: context.marketingAtRiskCount,
      pendingAdjustments: context.pendingAdjustments,
    });
    const opportunities = buildExecutiveOpportunities({
      topTeamName: context.marketing?.topTeamName ?? null,
      topTeamRoi: context.marketing?.depositRoi ?? null,
      financeNet: context.dashboard.finance?.net ?? 0,
      attendanceRate: context.dashboard.attendance?.rate ?? 0,
    });

    return {
      scope,
      opportunities,
      recommendations: buildExecutiveRecommendations({
        risks,
        opportunities,
        bottomTeamName: context.marketing?.bottomTeamName ?? null,
        topTeamName: context.marketing?.topTeamName ?? null,
        financeNet: context.dashboard.finance?.net ?? 0,
        pendingApprovals: context.dashboard.workflows?.pending ?? 0,
      }),
    };
  }

  private async resolveScope(
    actor: ActorContext,
    companyId?: string,
  ): Promise<ExecutiveInsightScope> {
    const snapshotDate = new Date().toISOString().slice(0, 10);
    const hasAllScope = await this.companyAccess.hasAllScope(actor.userId);

    if (hasAllScope) {
      const resolvedCompanyId = companyId ?? actor.companyId ?? null;
      if (resolvedCompanyId) {
        await this.companyAccess.assertCompanyAccess(actor, resolvedCompanyId);
      }
      return {
        companyId: resolvedCompanyId,
        scope: resolvedCompanyId ? 'company' : 'all_companies',
        snapshotDate,
      };
    }

    const resolvedCompanyId = companyId ?? actor.companyId;
    if (!resolvedCompanyId) {
      throw new ExecutiveAccessDeniedError();
    }
    await this.companyAccess.assertCompanyAccess(actor, resolvedCompanyId);

    const employeeId = await this.resolveEmployeeId(actor.userId);
    const leaderTeamId = employeeId
      ? await this.marketingTeamService.leaderMarketingTeamId(employeeId)
      : null;

    if (leaderTeamId) {
      return {
        companyId: resolvedCompanyId,
        scope: 'leader',
        snapshotDate,
        teamId: leaderTeamId,
      };
    }

    if (await this.companyAccess.hasCompanyScope(actor.userId, resolvedCompanyId)) {
      return {
        companyId: resolvedCompanyId,
        scope: 'company',
        snapshotDate,
      };
    }

    throw new ExecutiveAccessDeniedError();
  }

  private async loadContext(actor: ActorContext, scope: ExecutiveInsightScope) {
    const companyId = scope.companyId;
    const [dashboardRaw, riskRaw, leave, commissionBlock, marketingInsights, pendingAdjustments] = await Promise.all([
      companyId
        ? this.reporting.getCompanyDashboard(companyId)
        : this.reporting.getExecutiveDashboard(),
      this.reporting.getRiskDashboard(companyId),
      this.loadLeaveSummary(companyId),
      companyId
        ? this.commissionDashboard.getDashboard(actor, { companyId })
        : this.commissionDashboard.getDashboard(actor, {}),
      this.loadMarketingInsights(actor, scope),
      companyId ? this.countPendingAdjustments(companyId) : this.countPendingAdjustments(null),
    ]);

    const dashboard = dashboardRaw as DashboardPayload;
    const riskPayload = riskRaw as { alerts?: Array<{ severity: string; category: string; message: string; count?: number }> };
    const commissionSummary = this.extractCommissionSummary(commissionBlock);

    return {
      dashboard,
      riskAlerts: riskPayload.alerts ?? [],
      risks: buildExecutiveRisks({
        alerts: riskPayload.alerts ?? [],
        commissionOnHold: dashboard.commission?.onHold ?? 0,
        pendingApprovals: dashboard.workflows?.pending ?? 0,
        attendanceRate: dashboard.attendance?.rate ?? 0,
        marketingAtRiskCount: marketingInsights?.atRiskEmployeeCount ?? 0,
        pendingAdjustments,
      }),
      leave,
      commissionSummary,
      marketing: marketingInsights,
      marketingAtRiskCount: marketingInsights?.atRiskEmployeeCount ?? 0,
      marketingStartedWork: marketingInsights?.startedWork ?? null,
      pendingAdjustments,
    };
  }

  private async loadMarketingInsights(
    actor: ActorContext,
    scope: ExecutiveInsightScope,
  ) {
    if (!scope.companyId) return null;
    try {
      const insights = await this.marketingInsights.getPerformanceInsights(actor, {
        companyId: scope.companyId,
        teamId: scope.scope === 'leader' ? scope.teamId ?? undefined : undefined,
      });
      return {
        totalExpense: insights.expenseSummary.totalExpense,
        depositRoi: insights.roiSummary.depositRoi,
        topTeamName: insights.topTeams[0]?.teamName ?? null,
        bottomTeamName: insights.bottomTeams[0]?.teamName ?? null,
        atRiskEmployeeCount: insights.atRiskEmployees.length,
        startedWork: insights.expenseSummary.kpi.startedWorkCount,
      };
    } catch {
      return null;
    }
  }

  private extractCommissionSummary(block: Awaited<ReturnType<CommissionExecutiveDashboardService['getDashboard']>>) {
    const summary = block.executiveSummary;
    if (!summary) return null;
    return {
      totalCommissionExpense: summary.totalCommissionExpense,
      totalPaid: summary.totalPaid,
      totalPending: summary.totalPending,
      totalHold: summary.totalHold,
    };
  }

  private async loadLeaveSummary(companyId: string | null) {
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    const where = {
      deletedAt: null,
      ...(companyId ? { companyId } : {}),
    };

    const [pendingRequests, approvedMtd, rejectedMtd] = await Promise.all([
      this.prisma.leaveRequest.count({ where: { ...where, status: 'pending' } }),
      this.prisma.leaveRequest.count({
        where: { ...where, status: 'approved', updatedAt: { gte: monthStart } },
      }),
      this.prisma.leaveRequest.count({
        where: { ...where, status: 'rejected', updatedAt: { gte: monthStart } },
      }),
    ]);

    return { pendingRequests, approvedMtd, rejectedMtd };
  }

  private async countPendingAdjustments(companyId: string | null): Promise<number> {
    return this.prisma.commissionAdjustmentRequest.count({
      where: {
        deletedAt: null,
        status: { in: ['draft', 'submitted', 'approved'] },
        ...(companyId ? { companyId } : {}),
      },
    });
  }

  private async resolveEmployeeId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }
}
