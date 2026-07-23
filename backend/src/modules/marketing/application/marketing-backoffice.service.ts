// ============================================================================
// MarketingBackOfficeService — review, edit, audit, KPI review queries
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { MarketingDailyReportStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  MARKETING_DAILY_REPORT_REPOSITORY,
  MarketingDailyReportRepository,
  MarketingDailyReportRow,
} from '../domain/repositories/marketing-daily-report.repository';
import { MarketingDailyReportNotFoundError } from '../domain/errors/marketing.errors';
import { MarketingAccessService } from './marketing-access.service';
import { MarketingCycleLockService } from './marketing-cycle-lock.service';
import { MarketingReportAuditService } from './marketing-report-audit.service';
import { MarketingDailyReportService } from './marketing-daily-report.service';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamRepository,
} from '../domain/repositories/marketing-team.repository';
import { MarketingTeamService } from './marketing-team.service';
import {
  BackOfficePatchMarketingReportDto,
  BackOfficeRejectMarketingReportDto,
  BackOfficeVoidMarketingReportDto,
  KpiReviewQuery,
  KpiReviewRow,
  ListMarketingReportsQuery,
  MarketingAuditLogResponse,
  MarketingReportDetailResponse,
  MarketingReportListItem,
  SearchMarketingAuditQuery,
} from './dto/marketing-backoffice.dto';
import {
  buildKpiSnapshot,
  MARKETING_KPI_TARGET,
  sumDailyReportTotals,
} from '../domain/services/marketing-kpi-aggregation.service';
import { PayrollCycleResolverService } from '../../../shared/payroll/payroll-cycle-resolver.service';

@Injectable()
export class MarketingBackOfficeService {
  constructor(
    @Inject(MARKETING_DAILY_REPORT_REPOSITORY)
    private readonly reports: MarketingDailyReportRepository,
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly marketingTeams: MarketingTeamRepository,
    private readonly marketingTeamService: MarketingTeamService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly access: MarketingAccessService,
    private readonly cycleLock: MarketingCycleLockService,
    private readonly reportAudit: MarketingReportAuditService,
    private readonly dailyReports: MarketingDailyReportService,
    private readonly cycleResolver: PayrollCycleResolverService,
  ) {}

  async listReports(
    actor: ActorContext,
    query: ListMarketingReportsQuery,
  ): Promise<MarketingReportListItem[]> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    await this.access.assertCanViewTeamReports(actor, query.companyId);

    const rows = await this.reports.listReports({
      companyId: query.companyId,
      teamId: query.teamId,
      employeeId: query.employeeId,
      status: query.status as MarketingDailyReportStatus | undefined,
      dateFrom: query.dateFrom ? parseDate(query.dateFrom) : undefined,
      dateTo: query.dateTo ? parseDate(query.dateTo) : undefined,
    });

    return rows.map((row) => ({
      id: row.id,
      reportDate: row.reportDate.toISOString().slice(0, 10),
      employeeId: row.employeeId,
      employeeName: row.employeeName,
      teamName: row.teamName,
      contactedCount: row.contactedCount,
      newMemberCount: row.newMemberCount,
      depositAmount: row.depositAmount,
      startedWorkCount: row.startedWorkCount,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
    }));
  }

  async getReport(actor: ActorContext, id: string): Promise<MarketingReportDetailResponse> {
    const row = await this.getOrThrow(actor, id);
    const enriched = await this.enrichReport(row);
    const auditHistory = await this.mapAuditEntries(await this.reportAudit.listByReportId(id));
    const approvalHistory = auditHistory.filter((entry) => (
      ['submit', 'approve', 'reject', 'void'].includes(entry.action)
    ));

    return {
      report: enriched,
      auditHistory,
      approvalHistory,
    };
  }

  async patchReport(
    actor: ActorContext,
    id: string,
    dto: BackOfficePatchMarketingReportDto,
  ) {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.reportDate);
    await this.access.assertCanEdit(actor, existing, dto.reason, { requireReason: true });

    const row = await this.reports.updateFields(id, {
      contactedCount: dto.contactedCount ?? existing.contactedCount,
      newMemberCount: dto.newMemberCount ?? existing.newMemberCount,
      depositAmount: dto.depositAmount ?? existing.depositAmount,
      startedWorkCount: dto.startedWorkCount ?? existing.startedWorkCount,
      note: dto.note !== undefined ? dto.note : existing.note,
      actorUserId: actor.userId,
    });

    await this.reportAudit.logFieldChanges({
      companyId: existing.companyId,
      reportId: id,
      actorId: actor.userId,
      action: 'update',
      reason: dto.reason,
      before: existing,
      after: row,
    });

    return this.enrichReport(row);
  }

  approveReport(actor: ActorContext, id: string) {
    return this.dailyReports.approveReport(actor, id);
  }

  rejectReport(actor: ActorContext, id: string, dto: BackOfficeRejectMarketingReportDto) {
    return this.dailyReports.rejectReport(actor, id, { rejectedReason: dto.reason });
  }

  voidReport(actor: ActorContext, id: string, dto: BackOfficeVoidMarketingReportDto) {
    return this.dailyReports.voidReport(actor, id, { voidReason: dto.reason });
  }

  async listReportAudit(actor: ActorContext, id: string): Promise<MarketingAuditLogResponse[]> {
    const row = await this.getOrThrow(actor, id);
    await this.access.assertCanViewTeamReports(actor, row.companyId);
    return this.mapAuditEntries(await this.reportAudit.listByReportId(id));
  }

  async searchAudit(
    actor: ActorContext,
    query: SearchMarketingAuditQuery,
  ): Promise<MarketingAuditLogResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    await this.access.assertCanViewTeamReports(actor, query.companyId);

    const entries = await this.reportAudit.search({
      companyId: query.companyId,
      reportId: query.reportId,
      employeeId: query.employeeId,
      actorId: query.userId,
      dateFrom: query.dateFrom ? parseDate(query.dateFrom) : undefined,
      dateTo: query.dateTo ? parseDateEnd(query.dateTo) : undefined,
    });
    return this.mapAuditEntries(entries);
  }

  async getKpiReview(actor: ActorContext, query: KpiReviewQuery): Promise<KpiReviewRow[]> {
    await this.companyAccess.assertCompanyAccess(actor, query.companyId);
    await this.access.assertCanViewTeamReports(actor, query.companyId);
    if (query.teamId) {
      await this.marketingTeamService.assertCanViewTeam(actor, query.companyId, query.teamId);
    }

    const earnCycleId = query.earnCycleId
      ?? await this.cycleResolver.resolveOpenEarnCycleId(query.companyId);
    if (!earnCycleId) return [];

    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, companyId: query.companyId, deletedAt: null },
    });
    if (!cycle) return [];

    const teams = await this.prisma.marketingTeam.findMany({
      where: {
        companyId: query.companyId,
        deletedAt: null,
        isActive: true,
        level: 'sub_team',
        id: query.teamId ?? undefined,
      },
      select: { id: true, name: true },
    });

    const rows: KpiReviewRow[] = [];
    const seen = new Set<string>();

    for (const team of teams) {
      const employeeIds = await this.marketingTeams.listTeamEmployeeIdsInPeriod(
        team.id,
        query.companyId,
        cycle.periodStart,
        cycle.periodEnd,
      );
      const bigLeaderEmployeeId = await this.marketingTeams.resolveRootBigLeaderEmployeeId(
        team.id,
        query.companyId,
      );

      for (const employeeId of employeeIds) {
        if (seen.has(employeeId)) continue;
        seen.add(employeeId);

        const employee = await this.prisma.employee.findFirst({
          where: { id: employeeId, deletedAt: null },
          select: { id: true, firstName: true, lastName: true, nickname: true },
        });
        if (!employee) continue;

        const reportRows = await this.reports.listEmployeeReportsInPeriod(
          query.companyId,
          employeeId,
          cycle.periodStart,
          cycle.periodEnd,
          'projected',
        );
        const relevantRows = [];
        for (const row of reportRows) {
          if (!row.reportDate) continue;
          const teamAtDate = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
            query.companyId,
            employeeId,
            row.reportDate,
          );
          if (teamAtDate?.teamId === team.id) relevantRows.push(row);
        }
        const totals = sumDailyReportTotals(relevantRows);
        const kpiExempt = bigLeaderEmployeeId === employeeId;
        const snapshot = buildKpiSnapshot(totals, kpiExempt);

        rows.push({
          employeeId,
          employeeName: employee.nickname
            ?? `${employee.firstName} ${employee.lastName}`.trim(),
          teamName: team.name,
          contactedCount: totals.contactedCount,
          newMemberCount: totals.newMemberCount,
          depositAmount: Math.round(totals.depositAmount * 100) / 100,
          startedWorkCount: totals.startedWorkCount,
          targetCount: MARKETING_KPI_TARGET,
          remainingCount: snapshot.remainingCount,
          conversionPercent: snapshot.conversionRatePercent,
          qualified: snapshot.qualified,
          status: snapshot.qualified ? 'qualified' : snapshot.riskLevel,
        });
      }
    }

    rows.sort((a, b) => {
      const byTeam = (a.teamName ?? '').localeCompare(b.teamName ?? '', 'th');
      return byTeam !== 0 ? byTeam : a.employeeName.localeCompare(b.employeeName, 'th');
    });
    return rows;
  }

  async getLatestMyReport(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const employeeId = await this.dailyReports.requireEmployeeIdForActor(actor);
    const row = await this.reports.findLatestByEmployee(companyId, employeeId);
    if (!row) return null;
    return this.enrichReport(row);
  }

  async getReportAuditForAi(actor: ActorContext, reportId: string) {
    const detail = await this.getReport(actor, reportId);
    return {
      reportId,
      status: detail.report.status,
      changeCount: detail.auditHistory.filter((e) => e.action === 'update').length,
      auditHistory: detail.auditHistory,
    };
  }

  private async getOrThrow(actor: ActorContext, id: string): Promise<MarketingDailyReportRow> {
    const row = await this.reports.findById(id);
    if (!row) throw new MarketingDailyReportNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  private async enrichReport(row: MarketingDailyReportRow) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: row.employeeId, deletedAt: null },
      select: { firstName: true, lastName: true, nickname: true },
    });
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId: row.employeeId,
        companyId: row.companyId,
        deletedAt: null,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: { team: { select: { name: true } } },
    });

    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      employeeName: employee?.nickname
        ?? `${employee?.firstName ?? ''} ${employee?.lastName ?? ''}`.trim(),
      teamName: assignment?.team?.name ?? null,
      reportDate: row.reportDate.toISOString().slice(0, 10),
      contactedCount: row.contactedCount,
      newMemberCount: row.newMemberCount,
      depositAmount: row.depositAmount,
      startedWorkCount: row.startedWorkCount,
      note: row.note,
      status: row.status,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      rejectedReason: row.rejectedReason,
      voidReason: row.voidReason,
    };
  }

  private async mapAuditEntries(
    entries: Awaited<ReturnType<MarketingReportAuditService['listByReportId']>>,
  ): Promise<MarketingAuditLogResponse[]> {
    const actorIds = [...new Set(entries.map((e) => e.actorId))];
    const users = await this.prisma.user.findMany({
      where: { id: { in: actorIds }, deletedAt: null },
      select: {
        id: true,
        username: true,
        employee: { select: { nickname: true, firstName: true, lastName: true } },
      },
    });
    const nameById = new Map(users.map((u) => [
      u.id,
      (u.employee?.nickname
        ?? `${u.employee?.firstName ?? ''} ${u.employee?.lastName ?? ''}`.trim())
        || u.username,
    ]));

    return entries.map((entry) => ({
      id: entry.id,
      reportId: entry.reportId,
      actorId: entry.actorId,
      actorName: nameById.get(entry.actorId) ?? null,
      action: entry.action,
      fieldName: entry.fieldName,
      oldValue: entry.oldValue,
      newValue: entry.newValue,
      reason: entry.reason,
      createdAt: entry.createdAt.toISOString(),
    }));
  }
}

function parseDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function parseDateEnd(isoDate: string): Date {
  return new Date(`${isoDate}T23:59:59.999Z`);
}
