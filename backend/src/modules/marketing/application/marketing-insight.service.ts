// ============================================================================
// MarketingInsightService — read-only marketing performance analysis for AI
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PayrollCycleResolverService } from '../../../shared/payroll/payroll-cycle-resolver.service';
import { MarketingTeamAccessDeniedError } from '../domain/errors/marketing-team.errors';
import { MarketingKpiQueryService } from './marketing-kpi-query.service';
import { MarketingExpenseService } from './marketing-expense.service';
import { MarketingTeamService } from './marketing-team.service';
import { MarketingBackOfficeService } from './marketing-backoffice.service';
import {
  MarketingForecastResponse,
  MarketingInsightScope,
  MarketingPerformanceInsights,
  MarketingRiskAlertsResponse,
  MarketingTeamComparisonResponse,
} from './dto/marketing-insight.dto';
import {
  buildConversionAnomalies,
  buildExpenseAnomalies,
  buildForecast,
  buildRecommendations,
  buildRiskAlerts,
  buildTeamComparisonRows,
  buildTeamExpenseAnomalies,
  filterAtRiskEmployees,
  filterFailedKpiEmployees,
  InsightCategorySpend,
  InsightEmployeeRow,
  InsightTeamRow,
  rankEmployeesByStartedWork,
  rankExpensesByTeam,
  rankTeamsByRoi,
  splitTopBottomTeams,
} from '../domain/services/marketing-insight.builder';

interface InsightQuery {
  companyId?: string;
  earnCycleId?: string;
  teamId?: string;
}

@Injectable()
export class MarketingInsightService {
  constructor(
    private readonly kpi: MarketingKpiQueryService,
    private readonly expenses: MarketingExpenseService,
    private readonly marketingTeamService: MarketingTeamService,
    private readonly backoffice: MarketingBackOfficeService,
    private readonly companyAccess: CompanyAccessService,
    private readonly cycleResolver: PayrollCycleResolverService,
    private readonly prisma: PrismaService,
  ) {}

  async getPerformanceInsights(
    actor: ActorContext,
    query: InsightQuery,
  ): Promise<MarketingPerformanceInsights> {
    const scope = await this.resolveScope(actor, query);
    const context = await this.loadContext(actor, scope);
    const teamRanking = rankTeamsByRoi(context.teams);
    const employeeRanking = rankEmployeesByStartedWork(context.employees);
    const expenseRanking = rankExpensesByTeam(context.teams);
    const { topTeams, bottomTeams } = splitTopBottomTeams(teamRanking);
    const failedKpiEmployees = filterFailedKpiEmployees(employeeRanking);
    const atRiskEmployees = filterAtRiskEmployees(employeeRanking);
    const categoryRows: InsightCategorySpend[] = Object.entries(context.expenseSummary.byCategory)
      .map(([category, amount]) => ({ category, amount }));
    const anomalies = [
      ...buildExpenseAnomalies(categoryRows, context.expenseSummary.totalExpense),
      ...buildTeamExpenseAnomalies(context.teams),
      ...buildConversionAnomalies(context.teams),
    ];
    const recommendations = buildRecommendations({
      bottomTeams,
      atRiskEmployees,
      anomalies,
      carryForwardTotal: context.carryForwardTotal,
    });

    return {
      scope,
      teamRanking,
      employeeRanking,
      expenseRanking,
      topTeams,
      bottomTeams,
      topEmployees: employeeRanking.slice(0, 5),
      failedKpiEmployees,
      atRiskEmployees,
      expenseSummary: context.expenseSummary,
      roiSummary: {
        depositRoi: context.expenseSummary.depositRoi,
        costPerStartedWork: context.expenseSummary.costPerStartedWork,
        totalExpense: context.expenseSummary.totalExpense,
      },
      anomalies,
      recommendations,
    };
  }

  async getRiskAlerts(
    actor: ActorContext,
    query: InsightQuery,
  ): Promise<MarketingRiskAlertsResponse> {
    const scope = await this.resolveScope(actor, query);
    const context = await this.loadContext(actor, scope);
    const employeeRanking = rankEmployeesByStartedWork(context.employees);
    const companyAvgExpense = context.teams.length > 0
      ? context.teams.reduce((sum, t) => sum + t.totalExpense, 0) / context.teams.length
      : 0;
    const alerts = buildRiskAlerts({
      teams: context.teams,
      employees: employeeRanking,
      carryForwardTotal: context.carryForwardTotal,
      pendingAdjustments: context.pendingAdjustments,
      companyAvgExpense,
    });

    return { scope, ...alerts };
  }

  async getForecast(
    actor: ActorContext,
    query: InsightQuery,
  ): Promise<MarketingForecastResponse> {
    const scope = await this.resolveScope(actor, query);
    const context = await this.loadContext(actor, scope);
    const forecast = buildForecast({
      projectedStartedWorkCount: context.employees.reduce((sum, e) => sum + e.startedWorkCount, 0),
      projectedExpenses: context.expenseSummary.totalExpense,
      projectedCommissionPool: context.projectedCommissionPool,
      projectedCarryForward: context.carryForwardTotal > 0 ? context.carryForwardTotal : null,
      projectedDepositAmount: context.employees.reduce((sum, e) => sum + e.depositAmount, 0),
    });
    return { scope, forecast };
  }

  async getTeamComparison(
    actor: ActorContext,
    query: InsightQuery,
  ): Promise<MarketingTeamComparisonResponse> {
    const scope = await this.resolveScope(actor, query);
    const context = await this.loadContext(actor, scope);
    return {
      scope,
      teams: buildTeamComparisonRows(context.teams),
    };
  }

  private async resolveScope(
    actor: ActorContext,
    query: InsightQuery,
  ): Promise<MarketingInsightScope> {
    const companyId = query.companyId ?? actor.companyId;
    if (!companyId) {
      throw new MarketingTeamAccessDeniedError();
    }
    await this.companyAccess.assertCompanyAccess(actor, companyId);

    const earnCycleId = query.earnCycleId
      ?? await this.cycleResolver.resolveOpenEarnCycleId(companyId);
    const cycle = earnCycleId
      ? await this.prisma.payrollCycle.findFirst({
        where: { id: earnCycleId, companyId, deletedAt: null },
        select: { id: true, periodStart: true, periodEnd: true },
      })
      : null;
    const cycleLabel = cycle
      ? `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`
      : null;

    const hasAllScope = await this.companyAccess.hasAllScope(actor.userId);
    if (hasAllScope) {
      if (query.teamId) {
        await this.marketingTeamService.assertCanViewTeam(actor, companyId, query.teamId);
      }
      return {
        companyId,
        earnCycleId: earnCycleId ?? null,
        cycleLabel,
        teamId: query.teamId ?? null,
        rootTeamId: null,
      };
    }

    const employeeId = await this.resolveEmployeeId(actor.userId);
    if (!employeeId) {
      throw new MarketingTeamAccessDeniedError();
    }
    const leaderTeamId = await this.marketingTeamService.leaderMarketingTeamId(employeeId);
    if (!leaderTeamId) {
      throw new MarketingTeamAccessDeniedError();
    }

    const leaderTeam = await this.prisma.marketingTeam.findFirst({
      where: { id: leaderTeamId, deletedAt: null },
      select: { id: true, level: true },
    });
    const scopedTeamId = query.teamId
      ?? (leaderTeam?.level === 'sub_team' ? leaderTeamId : null);
    const rootTeamId = leaderTeam?.level === 'root' ? leaderTeamId : null;

    if (scopedTeamId) {
      await this.marketingTeamService.assertCanViewTeam(actor, companyId, scopedTeamId);
    }

    return {
      companyId,
      earnCycleId: earnCycleId ?? null,
      cycleLabel,
      teamId: scopedTeamId,
      rootTeamId,
    };
  }

  private async loadContext(
    actor: ActorContext,
    scope: MarketingInsightScope,
  ) {
    const earnCycleId = scope.earnCycleId ?? undefined;
    const expenseSummary = scope.teamId
      ? await this.expenses.getTeamExpenseSummaryForAi(actor, scope.companyId, scope.teamId, earnCycleId)
      : await this.expenses.getCompanyExpenseSummaryForAi(actor, scope.companyId, earnCycleId);

    const roiData = await this.expenses.getMarketingRoi(
      actor,
      scope.companyId,
      scope.teamId ?? undefined,
      earnCycleId,
    );

    const reviewRows = await this.loadReviewRows(actor, scope, earnCycleId);

    const teams = await this.buildTeamRows(
      actor,
      scope,
      reviewRows,
      roiData.teamRankings ?? [],
      expenseSummary,
    );
    const employees = this.buildEmployeeRows(reviewRows, teams);
    const carryForwardTotal = await this.sumCarryForward(scope);
    const pendingAdjustments = await this.countPendingAdjustments(scope.companyId, earnCycleId);
    const projectedCommissionPool = await this.estimateCommissionPool(scope.companyId, earnCycleId, scope.teamId);

    return {
      expenseSummary,
      teams,
      employees,
      carryForwardTotal,
      pendingAdjustments,
      projectedCommissionPool,
    };
  }

  private async loadReviewRows(
    actor: ActorContext,
    scope: MarketingInsightScope,
    earnCycleId?: string,
  ) {
    if (scope.rootTeamId && !scope.teamId) {
      const subTeams = await this.prisma.marketingTeam.findMany({
        where: {
          companyId: scope.companyId,
          parentTeamId: scope.rootTeamId,
          level: 'sub_team',
          deletedAt: null,
          isActive: true,
        },
        select: { id: true },
      });
      const rows = [];
      for (const team of subTeams) {
        rows.push(...await this.backoffice.getKpiReview(actor, {
          companyId: scope.companyId,
          earnCycleId: earnCycleId ?? undefined,
          teamId: team.id,
        }));
      }
      return rows;
    }

    return this.backoffice.getKpiReview(actor, {
      companyId: scope.companyId,
      earnCycleId: earnCycleId ?? undefined,
      teamId: scope.teamId ?? undefined,
    });
  }

  private async buildTeamRows(
    actor: ActorContext,
    scope: MarketingInsightScope,
    reviewRows: Array<{
      employeeId: string;
      teamName: string | null;
      contactedCount: number;
      newMemberCount: number;
      depositAmount: number;
      startedWorkCount: number;
      qualified: boolean;
    }>,
    roiRankings: Array<{ teamId: string; teamName: string; depositRoi: number | null; totalExpense: number }>,
    expenseSummary: { costPerStartedWork: number | null },
  ): Promise<InsightTeamRow[]> {
    const teamFilter = scope.teamId
      ? { companyId: scope.companyId, deletedAt: null, isActive: true, level: 'sub_team' as const, id: scope.teamId }
      : scope.rootTeamId
        ? { companyId: scope.companyId, deletedAt: null, isActive: true, level: 'sub_team' as const, parentTeamId: scope.rootTeamId }
        : { companyId: scope.companyId, deletedAt: null, isActive: true, level: 'sub_team' as const };

    const dbTeams = await this.prisma.marketingTeam.findMany({
      where: teamFilter,
      select: { id: true, name: true },
    });

    const companyKpi = await this.kpi.getCompanyKpi(actor, scope.companyId, scope.earnCycleId ?? undefined);
    const breakdown = new Map(companyKpi.teamBreakdown.map((row) => [row.teamId, row]));

    return Promise.all(dbTeams.map(async (team) => {
      const members = reviewRows.filter((row) => row.teamName === team.name);
      const totals = members.reduce(
        (acc, row) => ({
          contactedCount: acc.contactedCount + row.contactedCount,
          newMemberCount: acc.newMemberCount + row.newMemberCount,
          depositAmount: acc.depositAmount + row.depositAmount,
          startedWorkCount: acc.startedWorkCount + row.startedWorkCount,
          passedKpi: acc.passedKpi + (row.qualified ? 1 : 0),
        }),
        { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0, passedKpi: 0 },
      );
      const roi = roiRankings.find((row) => row.teamId === team.id);
      const teamSummary = await this.expenses.getTeamExpenseSummaryForAi(
        actor,
        scope.companyId,
        team.id,
        scope.earnCycleId ?? undefined,
      );
      const teamBreakdown = breakdown.get(team.id);

      return {
        teamId: team.id,
        teamName: team.name,
        contactedCount: totals.contactedCount,
        newMemberCount: totals.newMemberCount,
        depositAmount: totals.depositAmount,
        startedWorkCount: totals.startedWorkCount,
        totalExpense: roi?.totalExpense ?? teamSummary.totalExpense,
        depositRoi: roi?.depositRoi ?? teamSummary.depositRoi,
        costPerStartedWork: teamSummary.costPerStartedWork ?? expenseSummary.costPerStartedWork,
        passedKpi: teamBreakdown?.passedKpi ?? totals.passedKpi,
        totalEmployees: teamBreakdown?.totalEmployees ?? members.length,
      };
    }));
  }

  private buildEmployeeRows(
    reviewRows: Array<{
      employeeId: string;
      employeeName: string;
      teamName: string | null;
      contactedCount: number;
      newMemberCount: number;
      depositAmount: number;
      startedWorkCount: number;
      conversionPercent: number;
      qualified: boolean;
    }>,
    teams: InsightTeamRow[],
  ): InsightEmployeeRow[] {
    const teamByName = new Map(teams.map((team) => [team.teamName, team]));
    return reviewRows.map((row) => ({
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      teamId: row.teamName ? teamByName.get(row.teamName)?.teamId ?? null : null,
      teamName: row.teamName,
      contactedCount: row.contactedCount,
      newMemberCount: row.newMemberCount,
      depositAmount: row.depositAmount,
      startedWorkCount: row.startedWorkCount,
      conversionPercent: row.conversionPercent,
      qualified: row.qualified,
    }));
  }

  private async sumCarryForward(scope: MarketingInsightScope): Promise<number> {
    const teamScope = scope.teamId
      ? { teamId: scope.teamId }
      : scope.rootTeamId
        ? { team: { parentTeamId: scope.rootTeamId } }
        : {};

    const rows = await this.prisma.marketingCommissionCarryForward.findMany({
      where: {
        companyId: scope.companyId,
        deletedAt: null,
        status: 'pending',
        ...teamScope,
      },
      select: { amount: true },
    });
    return rows.reduce((sum, row) => sum + Number(row.amount), 0);
  }

  private async countPendingAdjustments(companyId: string, earnCycleId?: string): Promise<number> {
    return this.prisma.commissionAdjustmentRequest.count({
      where: {
        companyId,
        deletedAt: null,
        ...(earnCycleId ? { earnCycleId } : {}),
        status: { in: ['draft', 'submitted', 'approved'] },
      },
    });
  }

  private async estimateCommissionPool(
    companyId: string,
    earnCycleId?: string,
    teamId?: string | null,
  ): Promise<number | null> {
    const cycle = await this.prisma.commissionCycle.findFirst({
      where: {
        companyId,
        deletedAt: null,
        type: 'marketing',
        ...(earnCycleId ? { earnCycleId } : {}),
        ...(teamId ? { teamId } : {}),
      },
      orderBy: { updatedAt: 'desc' },
      select: { totalCommission: true, status: true },
    });
    if (cycle) return Number(cycle.totalCommission);

    const memberResults = await this.prisma.marketingCommissionMemberResult.findMany({
      where: {
        cycle: {
          companyId,
          deletedAt: null,
          ...(earnCycleId ? { earnCycleId } : {}),
          ...(teamId ? { teamId } : {}),
        },
      },
      select: { finalPayout: true },
    });
    if (memberResults.length === 0) return null;
    return memberResults.reduce((sum, row) => sum + Number(row.finalPayout), 0);
  }

  private async resolveEmployeeId(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }
}
