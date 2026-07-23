// ============================================================================
// MarketingExpenseService — expense workflow + aggregation queries
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { PayrollCycleResolverService } from '../../../shared/payroll/payroll-cycle-resolver.service';
import {
  MARKETING_DAILY_REPORT_REPOSITORY,
  MarketingDailyReportRepository,
} from '../domain/repositories/marketing-daily-report.repository';
import {
  MARKETING_EXPENSE_REPOSITORY,
  MarketingExpenseListFilters,
  MarketingExpenseRepository,
  MarketingExpenseRow,
} from '../domain/repositories/marketing-expense.repository';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamRepository,
} from '../domain/repositories/marketing-team.repository';
import {
  InvalidMarketingExpenseTransitionError,
  MarketingEmployeeNotLinkedError,
  MarketingExpenseNotEditableError,
  MarketingExpenseNotFoundError,
} from '../domain/errors/marketing.errors';
import { MarketingCycleLockService } from './marketing-cycle-lock.service';
import {
  buildExpenseMetrics,
  emptyCategoryTotals,
} from '../domain/services/marketing-expense-aggregation.service';
import { sumDailyReportTotals } from '../domain/services/marketing-kpi-aggregation.service';
import {
  CreateMarketingExpenseDto,
  ListMarketingExpensesQuery,
  MarketingExpenseResponse,
  MarketingExpenseSummaryQuery,
  MarketingExpenseSummaryResponse,
  RejectMarketingExpenseDto,
  UpdateMarketingExpenseDto,
  VoidMarketingExpenseDto,
} from './dto/marketing-expense.dto';

@Injectable()
export class MarketingExpenseService {
  constructor(
    @Inject(MARKETING_EXPENSE_REPOSITORY)
    private readonly expenses: MarketingExpenseRepository,
    @Inject(MARKETING_DAILY_REPORT_REPOSITORY)
    private readonly reports: MarketingDailyReportRepository,
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly marketingTeams: MarketingTeamRepository,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
    private readonly cycleResolver: PayrollCycleResolverService,
    private readonly cycleLock: MarketingCycleLockService,
  ) {}

  async createExpense(
    actor: ActorContext,
    dto: CreateMarketingExpenseDto,
  ): Promise<MarketingExpenseResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const employeeId = dto.employeeId ?? await this.optionalEmployeeId(actor);
    const expenseDate = parseDate(dto.expenseDate);
    await this.cycleLock.assertUnlockedForReportDate(dto.companyId, expenseDate);

    const earnCycleId = dto.earnCycleId
      ?? await this.requireEarnCycleId(dto.companyId, expenseDate);

    let teamId = dto.teamId ?? null;
    if (!teamId && employeeId) {
      const teamAtDate = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
        dto.companyId,
        employeeId,
        expenseDate,
      );
      teamId = teamAtDate?.teamId ?? null;
    }

    const row = await this.expenses.create({
      companyId: dto.companyId,
      teamId,
      employeeId,
      earnCycleId,
      expenseDate,
      category: dto.category,
      subCategory: dto.subCategory ?? null,
      amount: dto.amount,
      description: dto.description ?? null,
      attachmentUrl: dto.attachmentUrl ?? null,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'MarketingExpense',
      entityId: row.id,
      action: 'create',
      after: row,
    });
    return this.toResponse(row);
  }

  async updateExpense(
    actor: ActorContext,
    id: string,
    dto: UpdateMarketingExpenseDto,
  ): Promise<MarketingExpenseResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.expenseDate);
    if (existing.status !== 'draft' && existing.status !== 'submitted') {
      throw new MarketingExpenseNotEditableError(existing.status);
    }

    const expenseDate = dto.expenseDate ? parseDate(dto.expenseDate) : existing.expenseDate;
    if (dto.expenseDate) {
      await this.cycleLock.assertUnlockedForReportDate(existing.companyId, expenseDate);
    }

    const row = await this.expenses.update(id, {
      teamId: dto.teamId,
      employeeId: dto.employeeId,
      expenseDate: dto.expenseDate ? expenseDate : undefined,
      category: dto.category,
      subCategory: dto.subCategory,
      amount: dto.amount,
      description: dto.description,
      attachmentUrl: dto.attachmentUrl,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'MarketingExpense',
      entityId: id,
      action: 'update',
      before: existing,
      after: row,
    });
    return this.toResponse(row);
  }

  async submitExpense(actor: ActorContext, id: string): Promise<MarketingExpenseResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.expenseDate);
    if (existing.status !== 'draft') {
      throw new InvalidMarketingExpenseTransitionError(existing.status, 'submit');
    }

    const row = await this.expenses.saveStatus(id, 'submitted', actor.userId, {
      submittedBy: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'MarketingExpense',
      entityId: id,
      action: 'submit',
      after: row,
    });
    return this.toResponse(row);
  }

  async approveExpense(actor: ActorContext, id: string): Promise<MarketingExpenseResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.expenseDate);
    if (existing.status !== 'submitted') {
      throw new InvalidMarketingExpenseTransitionError(existing.status, 'approve');
    }

    const row = await this.expenses.saveStatus(id, 'approved', actor.userId, {
      submittedBy: existing.submittedBy ?? actor.userId,
      approvedBy: actor.userId,
      approvedAt: new Date(),
    });
    await this.audit.record(actor, {
      entityType: 'MarketingExpense',
      entityId: id,
      action: 'approve',
      after: row,
    });
    return this.toResponse(row);
  }

  async rejectExpense(
    actor: ActorContext,
    id: string,
    dto: RejectMarketingExpenseDto,
  ): Promise<MarketingExpenseResponse> {
    const existing = await this.getOrThrow(actor, id);
    if (existing.status !== 'submitted') {
      throw new InvalidMarketingExpenseTransitionError(existing.status, 'reject');
    }

    const row = await this.expenses.saveStatus(id, 'rejected', actor.userId, {
      submittedBy: existing.submittedBy,
      rejectedReason: dto.reason,
    });
    await this.audit.record(actor, {
      entityType: 'MarketingExpense',
      entityId: id,
      action: 'reject',
      after: row,
    });
    return this.toResponse(row);
  }

  async voidExpense(
    actor: ActorContext,
    id: string,
    dto: VoidMarketingExpenseDto = {},
  ): Promise<MarketingExpenseResponse> {
    const existing = await this.getOrThrow(actor, id);
    if (!['submitted', 'approved'].includes(existing.status)) {
      throw new InvalidMarketingExpenseTransitionError(existing.status, 'void');
    }

    const row = await this.expenses.saveStatus(id, 'voided', actor.userId, {
      submittedBy: existing.submittedBy,
      approvedBy: existing.approvedBy,
      approvedAt: existing.approvedAt,
      rejectedReason: dto.reason ?? existing.rejectedReason,
    });
    await this.audit.record(actor, {
      entityType: 'MarketingExpense',
      entityId: id,
      action: 'void',
      after: row,
    });
    return this.toResponse(row);
  }

  async listExpenses(
    actor: ActorContext,
    query: ListMarketingExpensesQuery,
  ): Promise<MarketingExpenseResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    const rows = await this.expenses.list(this.toFilters(query));
    return rows.map((row) => this.toResponse(row));
  }

  async getExpense(actor: ActorContext, id: string): Promise<MarketingExpenseResponse> {
    const row = await this.getOrThrow(actor, id);
    return this.toResponse(row);
  }

  async getExpenseSummary(
    actor: ActorContext,
    query: MarketingExpenseSummaryQuery,
  ): Promise<MarketingExpenseSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    return this.buildSummary(query);
  }

  async getTeamExpenseSummary(
    actor: ActorContext,
    query: MarketingExpenseSummaryQuery & { teamId: string },
  ): Promise<MarketingExpenseSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    return this.buildSummary(query);
  }

  async getCompanyExpenseSummary(
    actor: ActorContext,
    query: MarketingExpenseSummaryQuery,
  ): Promise<MarketingExpenseSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    return this.buildSummary({ ...query, teamId: undefined, employeeId: undefined });
  }

  /** Approved expense totals mapped to commission financial buckets. */
  async resolveCommissionExpenseTotals(
    companyId: string,
    teamId: string,
    earnCycleId: string,
  ) {
    return this.expenses.aggregateCommissionTotals(companyId, teamId, earnCycleId);
  }

  async getMyExpenses(
    actor: ActorContext,
    companyId: string,
    earnCycleId?: string,
  ): Promise<MarketingExpenseResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const employeeId = await this.requireEmployeeId(actor);
    const rows = await this.expenses.list({
      companyId,
      employeeId,
      earnCycleId,
      limit: 50,
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getMyExpenseSummary(
    actor: ActorContext,
    companyId: string,
    earnCycleId?: string,
  ): Promise<MarketingExpenseSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const employeeId = await this.requireEmployeeId(actor);
    return this.buildSummary({ companyId, employeeId, earnCycleId });
  }

  async getTeamExpenseSummaryForAi(
    actor: ActorContext,
    companyId: string,
    teamId: string,
    earnCycleId?: string,
  ): Promise<MarketingExpenseSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.buildSummary({ companyId, teamId, earnCycleId });
  }

  async getCompanyExpenseSummaryForAi(
    actor: ActorContext,
    companyId: string,
    earnCycleId?: string,
  ): Promise<MarketingExpenseSummaryResponse> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.buildSummary({ companyId, earnCycleId });
  }

  async getMarketingRoi(
    actor: ActorContext,
    companyId: string,
    teamId?: string,
    earnCycleId?: string,
  ): Promise<MarketingExpenseSummaryResponse & { teamRankings?: Array<{ teamId: string; teamName: string; depositRoi: number | null; totalExpense: number }> }> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);

    if (teamId) {
      return this.buildSummary({ companyId, teamId, earnCycleId });
    }

    const teams = await this.prisma.marketingTeam.findMany({
      where: { companyId, deletedAt: null, isActive: true, level: 'sub_team' },
      select: { id: true, name: true, code: true },
    });

    const teamRankings = await Promise.all(teams.map(async (team) => {
      const summary = await this.buildSummary({ companyId, teamId: team.id, earnCycleId });
      return {
        teamId: team.id,
        teamName: team.name,
        teamCode: team.code,
        depositRoi: summary.depositRoi,
        totalExpense: summary.totalExpense,
      };
    }));

    teamRankings.sort((a, b) => (b.depositRoi ?? 0) - (a.depositRoi ?? 0));

    const companySummary = await this.buildSummary({ companyId, earnCycleId });
    return { ...companySummary, teamRankings };
  }

  private async buildSummary(
    query: MarketingExpenseSummaryQuery,
  ): Promise<MarketingExpenseSummaryResponse> {
    const filters: Omit<MarketingExpenseListFilters, 'status' | 'limit'> = {
      companyId: query.companyId,
      teamId: query.teamId,
      employeeId: query.employeeId,
      earnCycleId: query.earnCycleId,
      dateFrom: query.dateFrom ? parseDate(query.dateFrom) : undefined,
      dateTo: query.dateTo ? parseDate(query.dateTo) : undefined,
    };

    const [totalExpense, byCategory, kpi] = await Promise.all([
      this.expenses.sumApprovedAmount(filters),
      this.expenses.aggregateApprovedByCategory(filters),
      this.loadKpiTotals(filters),
    ]);

    const metrics = buildExpenseMetrics(totalExpense, byCategory, kpi);
    return {
      totalExpense: metrics.totalExpense,
      costPerContact: metrics.costPerContact,
      costPerNewMember: metrics.costPerNewMember,
      costPerStartedWork: metrics.costPerStartedWork,
      depositRoi: metrics.depositRoi,
      byCategory: metrics.byCategory ?? emptyCategoryTotals(),
      kpi,
    };
  }

  private async loadKpiTotals(
    filters: Omit<MarketingExpenseListFilters, 'status' | 'limit'>,
  ) {
    if (filters.employeeId) {
      const earnCycleId = filters.earnCycleId
        ?? await this.cycleResolver.resolveOpenEarnCycleId(filters.companyId);
      if (!earnCycleId) {
        return { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 };
      }
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: { id: earnCycleId, deletedAt: null },
      });
      if (!cycle) {
        return { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 };
      }
      const rows = await this.reports.listEmployeeReportsInPeriod(
        filters.companyId,
        filters.employeeId,
        cycle.periodStart,
        cycle.periodEnd,
        'final',
      );
      return sumDailyReportTotals(rows);
    }

    if (filters.teamId) {
      const earnCycleId = filters.earnCycleId
        ?? await this.cycleResolver.resolveOpenEarnCycleId(filters.companyId);
      if (!earnCycleId) {
        return { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 };
      }
      const members = await this.prisma.employeeAssignment.findMany({
        where: {
          companyId: filters.companyId,
          teamId: filters.teamId,
          effectiveTo: null,
          deletedAt: null,
        },
        select: { employeeId: true },
      });
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: { id: earnCycleId, deletedAt: null },
      });
      if (!cycle || members.length === 0) {
        return { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 };
      }

      const allRows = await Promise.all(members.map((m) =>
        this.reports.listEmployeeReportsInPeriod(
          filters.companyId,
          m.employeeId,
          cycle.periodStart,
          cycle.periodEnd,
          'final',
        )));
      return sumDailyReportTotals(allRows.flat());
    }

    const earnCycleId = filters.earnCycleId
      ?? await this.cycleResolver.resolveOpenEarnCycleId(filters.companyId);
    if (!earnCycleId) {
      return { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 };
    }
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, deletedAt: null },
    });
    if (!cycle) {
      return { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 };
    }

    const reports = await this.reports.listReports({
      companyId: filters.companyId,
      dateFrom: filters.dateFrom ?? cycle.periodStart,
      dateTo: filters.dateTo ?? cycle.periodEnd,
      status: 'approved',
      limit: 5000,
    });
    return sumDailyReportTotals(reports);
  }

  private toFilters(query: ListMarketingExpensesQuery): MarketingExpenseListFilters {
    return {
      companyId: query.companyId,
      teamId: query.teamId,
      employeeId: query.employeeId,
      earnCycleId: query.earnCycleId,
      status: query.status as MarketingExpenseListFilters['status'],
      category: query.category,
      dateFrom: query.dateFrom ? parseDate(query.dateFrom) : undefined,
      dateTo: query.dateTo ? parseDate(query.dateTo) : undefined,
    };
  }

  private async getOrThrow(actor: ActorContext, id: string): Promise<MarketingExpenseRow> {
    const row = await this.expenses.findById(id);
    if (!row) throw new MarketingExpenseNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  private async requireEmployeeId(actor: ActorContext): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) throw new MarketingEmployeeNotLinkedError();
    return user.employeeId;
  }

  private async optionalEmployeeId(actor: ActorContext): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }

  private async requireEarnCycleId(companyId: string, expenseDate: Date): Promise<string> {
    const earnCycleId = await this.cycleResolver.resolveEarnCycleId(companyId, expenseDate);
    if (!earnCycleId) {
      throw new MarketingExpenseNotEditableError('no earn cycle for expense date');
    }
    return earnCycleId;
  }

  private toResponse(row: MarketingExpenseRow): MarketingExpenseResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      teamId: row.teamId,
      employeeId: row.employeeId,
      earnCycleId: row.earnCycleId,
      expenseDate: row.expenseDate.toISOString().slice(0, 10),
      category: row.category,
      subCategory: row.subCategory,
      amount: row.amount,
      description: row.description,
      attachmentUrl: row.attachmentUrl,
      status: row.status,
      submittedBy: row.submittedBy,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectedReason: row.rejectedReason,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}

function parseDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
