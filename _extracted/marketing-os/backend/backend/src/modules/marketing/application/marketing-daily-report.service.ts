// ============================================================================
// MarketingDailyReportService — daily report workflow
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AuditService } from '../../../shared/audit/audit.service';
import {
  MARKETING_DAILY_REPORT_REPOSITORY,
  MarketingDailyReportRepository,
  MarketingDailyReportRow,
} from '../domain/repositories/marketing-daily-report.repository';
import {
  InvalidMarketingReportTransitionError,
  MarketingDailyReportNotEditableError,
  MarketingDailyReportNotFoundError,
  MarketingEmployeeNotLinkedError,
} from '../domain/errors/marketing.errors';
import { MarketingCycleLockService } from './marketing-cycle-lock.service';
import { MarketingReportAuditService } from './marketing-report-audit.service';
import {
  buildKpiSnapshot,
  MARKETING_KPI_TARGET,
  sumDailyReportTotals,
} from '../domain/services/marketing-kpi-aggregation.service';
import {
  CreateMarketingDailyReportDto,
  MarketingDailyReportResponse,
  RejectMarketingDailyReportDto,
  UpdateMarketingDailyReportDto,
  VoidMarketingDailyReportDto,
} from './dto/marketing-daily-report.dto';
import { PayrollCycleResolverService } from '../../../shared/payroll/payroll-cycle-resolver.service';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamRepository,
} from '../domain/repositories/marketing-team.repository';
import { MarketingTeamService } from './marketing-team.service';

@Injectable()
export class MarketingDailyReportService {
  constructor(
    @Inject(MARKETING_DAILY_REPORT_REPOSITORY)
    private readonly reports: MarketingDailyReportRepository,
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly marketingTeams: MarketingTeamRepository,
    private readonly marketingTeamService: MarketingTeamService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
    private readonly cycleResolver: PayrollCycleResolverService,
    private readonly cycleLock: MarketingCycleLockService,
    private readonly reportAudit: MarketingReportAuditService,
  ) {}

  async createOrUpdateReport(
    actor: ActorContext,
    dto: CreateMarketingDailyReportDto,
  ): Promise<MarketingDailyReportResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const employeeId = await this.requireEmployeeId(actor);

    const reportDate = parseDate(dto.reportDate);
    await this.cycleLock.assertUnlockedForReportDate(dto.companyId, reportDate);
    const existing = await this.reports.findByEmployeeAndDate(
      dto.companyId,
      employeeId,
      reportDate,
    );

    let row: MarketingDailyReportRow;
    if (existing) {
      if (existing.status !== 'draft') {
        throw new MarketingDailyReportNotEditableError(existing.status);
      }
      row = await this.reports.updateDraft(existing.id, {
        contactedCount: dto.contactedCount,
        newMemberCount: dto.newMemberCount,
        depositAmount: dto.depositAmount,
        startedWorkCount: dto.startedWorkCount,
        note: dto.note ?? null,
        actorUserId: actor.userId,
      });
    } else {
      row = await this.reports.upsertDraft({
        companyId: dto.companyId,
        employeeId,
        reportDate,
        contactedCount: dto.contactedCount,
        newMemberCount: dto.newMemberCount,
        depositAmount: dto.depositAmount,
        startedWorkCount: dto.startedWorkCount,
        note: dto.note ?? null,
        actorUserId: actor.userId,
      });
    }

    await this.audit.record(actor, {
      entityType: 'MarketingDailyReport',
      entityId: row.id,
      action: existing ? 'update' : 'create',
      after: row,
    });
    await this.reportAudit.logFieldChanges({
      companyId: row.companyId,
      reportId: row.id,
      actorId: actor.userId,
      action: existing ? 'update' : 'create',
      before: existing ?? emptyReportRow(row),
      after: row,
    });
    return this.toResponse(row);
  }

  async patchReport(
    actor: ActorContext,
    id: string,
    dto: UpdateMarketingDailyReportDto,
  ): Promise<MarketingDailyReportResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.reportDate);
    if (existing.status !== 'draft' && existing.status !== 'submitted') {
      throw new MarketingDailyReportNotEditableError(existing.status);
    }

    const employeeId = await this.requireEmployeeId(actor);
    if (existing.employeeId !== employeeId) {
      throw new MarketingDailyReportNotEditableError(existing.status);
    }

    const row = await this.reports.updateFields(id, {
      contactedCount: dto.contactedCount ?? existing.contactedCount,
      newMemberCount: dto.newMemberCount ?? existing.newMemberCount,
      depositAmount: dto.depositAmount ?? existing.depositAmount,
      startedWorkCount: dto.startedWorkCount ?? existing.startedWorkCount,
      note: dto.note !== undefined ? dto.note : existing.note,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'MarketingDailyReport',
      entityId: id,
      action: 'update',
      before: existing,
      after: row,
    });
    await this.reportAudit.logFieldChanges({
      companyId: existing.companyId,
      reportId: id,
      actorId: actor.userId,
      action: 'update',
      before: existing,
      after: row,
    });
    return this.toResponse(row);
  }

  async submitReport(actor: ActorContext, id: string): Promise<MarketingDailyReportResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.reportDate);
    if (existing.status !== 'draft') {
      throw new InvalidMarketingReportTransitionError(existing.status, 'submit');
    }

    const row = await this.reports.saveStatus(id, {
      status: 'submitted',
      submittedAt: new Date(),
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'MarketingDailyReport',
      entityId: id,
      action: 'submit',
      before: existing,
      after: row,
    });
    await this.reportAudit.logAction({
      companyId: existing.companyId,
      reportId: id,
      actorId: actor.userId,
      action: 'submit',
      fieldName: 'status',
      oldValue: existing.status,
      newValue: row.status,
    });
    return this.toResponse(row);
  }

  async approveReport(actor: ActorContext, id: string): Promise<MarketingDailyReportResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.reportDate);
    if (existing.status !== 'submitted') {
      throw new InvalidMarketingReportTransitionError(existing.status, 'approve');
    }

    const row = await this.reports.saveStatus(id, {
      status: 'approved',
      approvedBy: actor.userId,
      approvedAt: new Date(),
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'MarketingDailyReport',
      entityId: id,
      action: 'approve',
      before: existing,
      after: row,
    });
    await this.reportAudit.logAction({
      companyId: existing.companyId,
      reportId: id,
      actorId: actor.userId,
      action: 'approve',
      fieldName: 'status',
      oldValue: existing.status,
      newValue: row.status,
    });
    return this.toResponse(row);
  }

  async rejectReport(
    actor: ActorContext,
    id: string,
    dto: RejectMarketingDailyReportDto,
  ): Promise<MarketingDailyReportResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.reportDate);
    if (existing.status !== 'submitted') {
      throw new InvalidMarketingReportTransitionError(existing.status, 'reject');
    }

    const row = await this.reports.saveStatus(id, {
      status: 'rejected',
      rejectedReason: dto.rejectedReason,
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'MarketingDailyReport',
      entityId: id,
      action: 'reject',
      before: existing,
      after: row,
    });
    await this.reportAudit.logAction({
      companyId: existing.companyId,
      reportId: id,
      actorId: actor.userId,
      action: 'reject',
      fieldName: 'status',
      oldValue: existing.status,
      newValue: row.status,
      reason: dto.rejectedReason,
    });
    return this.toResponse(row);
  }

  async voidReport(
    actor: ActorContext,
    id: string,
    dto: VoidMarketingDailyReportDto,
  ): Promise<MarketingDailyReportResponse> {
    const existing = await this.getOrThrow(actor, id);
    await this.cycleLock.assertUnlockedForReportDate(existing.companyId, existing.reportDate);
    if (existing.status === 'voided') {
      throw new InvalidMarketingReportTransitionError(existing.status, 'void');
    }

    const row = await this.reports.saveStatus(id, {
      status: 'voided',
      voidReason: dto.voidReason,
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'MarketingDailyReport',
      entityId: id,
      action: 'void',
      before: existing,
      after: row,
    });
    await this.reportAudit.logAction({
      companyId: existing.companyId,
      reportId: id,
      actorId: actor.userId,
      action: 'void',
      fieldName: 'status',
      oldValue: existing.status,
      newValue: row.status,
      reason: dto.voidReason,
    });
    return this.toResponse(row);
  }

  async getMyReportByDate(
    actor: ActorContext,
    companyId: string,
    date: string,
  ): Promise<MarketingDailyReportResponse | null> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const employeeId = await this.requireEmployeeId(actor);
    const row = await this.reports.findByEmployeeAndDate(
      companyId,
      employeeId,
      parseDate(date),
    );
    return row ? this.toResponse(row) : null;
  }

  async getMyMonthlyKpi(actor: ActorContext, companyId: string, earnCycleId?: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const employeeId = await this.requireEmployeeId(actor);
    return this.buildEmployeeMonthlyKpi(employeeId, companyId, earnCycleId, 'projected');
  }

  async getTeamMonthlyKpi(
    actor: ActorContext,
    companyId: string,
    teamId: string,
    earnCycleId?: string,
  ) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    await this.marketingTeamService.assertCanViewTeam(actor, companyId, teamId);
    const cycle = await this.resolveCycle(companyId, earnCycleId);
    const employeeIds = await this.marketingTeams.listTeamEmployeeIdsInPeriod(
      teamId,
      companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );
    const bigLeaderEmployeeId = await this.marketingTeams.resolveRootBigLeaderEmployeeId(
      teamId,
      companyId,
    );

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, nickname: true },
    });
    const nameById = new Map(employees.map((e) => [
      e.id,
      e.nickname ?? `${e.firstName} ${e.lastName}`.trim(),
    ]));

    const members = [];
    for (const employeeId of employeeIds) {
      const kpiExempt = bigLeaderEmployeeId === employeeId;
      const reportRows = cycle.earnCycleId
        ? await this.reports.listEmployeeReportsInPeriod(
          companyId,
          employeeId,
          cycle.periodStart,
          cycle.periodEnd,
          'projected',
        )
        : [];
      const relevantRows = [];
      for (const row of reportRows) {
        if (!row.reportDate) continue;
        const teamAtDate = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
          companyId,
          employeeId,
          row.reportDate,
        );
        if (teamAtDate?.teamId === teamId) relevantRows.push(row);
      }
      const totals = sumDailyReportTotals(relevantRows);
      const snapshot = buildKpiSnapshot(totals, kpiExempt);
      members.push({
        employeeId,
        employeeName: nameById.get(employeeId) ?? employeeId.slice(0, 8),
        startedWorkCount: totals.startedWorkCount,
        targetCount: MARKETING_KPI_TARGET,
        qualified: snapshot.qualified,
        kpiExempt,
        riskLevel: snapshot.riskLevel,
      });
    }

    members.sort((a, b) => b.startedWorkCount - a.startedWorkCount);

    return {
      earnCycleId: cycle.earnCycleId,
      cycleLabel: cycle.cycleLabel,
      members,
      qualifiedCount: members.filter((m) => m.qualified).length,
      atRiskCount: members.filter((m) => !m.kpiExempt && m.riskLevel === 'at_risk').length,
      highRiskCount: members.filter((m) => !m.kpiExempt && m.riskLevel === 'high_risk').length,
    };
  }

  async getCompanyMonthlyKpi(
    actor: ActorContext,
    companyId: string,
    earnCycleId?: string,
  ) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const cycle = await this.resolveCycle(companyId, earnCycleId);

    const subTeams = await this.prisma.marketingTeam.findMany({
      where: { companyId, level: 'sub_team', deletedAt: null, isActive: true },
      select: { id: true, code: true, name: true },
    });

    const teamBreakdown = [];
    let passedKpi = 0;
    let failedKpi = 0;
    const totals = { contactedCount: 0, newMemberCount: 0, depositAmount: 0, startedWorkCount: 0 };
    const seen = new Set<string>();

    for (const subTeam of subTeams) {
      const employeeIds = await this.reports.listTeamEmployeeIds(
        subTeam.id,
        companyId,
        cycle.periodEnd,
      );
      const bigLeaderEmployeeId = await this.marketingTeams.resolveRootBigLeaderEmployeeId(
        subTeam.id,
        companyId,
      );

      let teamPassed = 0;
      let teamFailed = 0;
      let teamEmployees = 0;

      for (const employeeId of employeeIds) {
        if (seen.has(employeeId)) continue;
        seen.add(employeeId);
        teamEmployees += 1;

        const kpiExempt = bigLeaderEmployeeId === employeeId;
        const rows = cycle.earnCycleId
          ? await this.reports.listEmployeeReportsInPeriod(
            companyId,
            employeeId,
            cycle.periodStart,
            cycle.periodEnd,
            'projected',
          )
          : [];
        const relevantRows = [];
        for (const row of rows) {
          if (!row.reportDate) continue;
          const teamAtDate = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
            companyId,
            employeeId,
            row.reportDate,
          );
          if (teamAtDate?.teamId === subTeam.id) relevantRows.push(row);
        }
        const employeeTotals = sumDailyReportTotals(relevantRows);
        totals.contactedCount += employeeTotals.contactedCount;
        totals.newMemberCount += employeeTotals.newMemberCount;
        totals.depositAmount += employeeTotals.depositAmount;
        totals.startedWorkCount += employeeTotals.startedWorkCount;

        const snapshot = buildKpiSnapshot(employeeTotals, kpiExempt);
        if (snapshot.qualified) {
          passedKpi += 1;
          teamPassed += 1;
        } else if (!kpiExempt) {
          failedKpi += 1;
          teamFailed += 1;
        }
      }

      teamBreakdown.push({
        teamId: subTeam.id,
        teamCode: subTeam.code,
        teamName: subTeam.name,
        totalEmployees: teamEmployees,
        passedKpi: teamPassed,
        failedKpi: teamFailed,
      });
    }

    const totalEmployees = seen.size;
    const successRatePercent = totalEmployees > 0
      ? Math.round((passedKpi / totalEmployees) * 10000) / 100
      : 0;

    return {
      companyId,
      earnCycleId: cycle.earnCycleId,
      cycleLabel: cycle.cycleLabel,
      totalEmployees,
      passedKpi,
      failedKpi,
      successRatePercent,
      totals: {
        ...totals,
        depositAmount: Math.round(totals.depositAmount * 100) / 100,
      },
      teamBreakdown,
    };
  }

  private async buildEmployeeMonthlyKpi(
    employeeId: string,
    companyId: string,
    earnCycleId: string | undefined,
    mode: 'projected' | 'final',
  ) {
    const cycle = await this.resolveCycle(companyId, earnCycleId);
    const teamAtDate = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
      companyId,
      employeeId,
      cycle.periodEnd,
    );
    const bigLeaderEmployeeId = teamAtDate
      ? await this.marketingTeams.resolveRootBigLeaderEmployeeId(teamAtDate.teamId, companyId)
      : null;
    const kpiExempt = bigLeaderEmployeeId === employeeId;

    const rows = cycle.earnCycleId
      ? await this.reports.listEmployeeReportsInPeriod(
        companyId,
        employeeId,
        cycle.periodStart,
        cycle.periodEnd,
        mode,
      )
      : [];
    const totals = sumDailyReportTotals(rows);
    const snapshot = buildKpiSnapshot(totals, kpiExempt);

    const [carries, memberResult] = await Promise.all([
      this.prisma.marketingCommissionCarryForward.findMany({
        where: { employeeId, companyId, status: 'pending', deletedAt: null },
        select: { amount: true },
      }),
      cycle.earnCycleId
        ? this.prisma.marketingCommissionMemberResult.findFirst({
          where: {
            employeeId,
            cycle: { companyId, earnCycleId: cycle.earnCycleId, deletedAt: null },
          },
          select: { finalPayout: true },
        })
        : Promise.resolve(null),
    ]);

    return {
      ...snapshot,
      kpiExempt,
      carryForwardAmount: Math.round(
        carries.reduce((sum, row) => sum + Number(row.amount), 0) * 100,
      ) / 100,
      estimatedCommission: memberResult
        ? Math.round(Number(memberResult.finalPayout) * 100) / 100
        : 0,
      earnCycleId: cycle.earnCycleId,
      cycleLabel: cycle.cycleLabel,
    };
  }

  private async resolveCycle(companyId: string, earnCycleId?: string) {
    const id = earnCycleId ?? await this.cycleResolver.resolveOpenEarnCycleId(companyId);
    if (!id) {
      return {
        earnCycleId: null as string | null,
        cycleLabel: null as string | null,
        periodStart: new Date(0),
        periodEnd: new Date(0),
      };
    }
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id, companyId, deletedAt: null },
    });
    if (!cycle) {
      return {
        earnCycleId: null as string | null,
        cycleLabel: null as string | null,
        periodStart: new Date(0),
        periodEnd: new Date(0),
      };
    }
    return {
      earnCycleId: cycle.id,
      cycleLabel: `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
    };
  }

  private async getOrThrow(actor: ActorContext, id: string): Promise<MarketingDailyReportRow> {
    const row = await this.reports.findById(id);
    if (!row) throw new MarketingDailyReportNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  async requireEmployeeIdForActor(actor: ActorContext): Promise<string> {
    return this.requireEmployeeId(actor);
  }

  private async requireEmployeeId(actor: ActorContext): Promise<string> {
    const user = await this.prisma.user.findFirst({
      where: { id: actor.userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) throw new MarketingEmployeeNotLinkedError();
    return user.employeeId;
  }

  private toResponse(row: MarketingDailyReportRow): MarketingDailyReportResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
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
}

function parseDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

function emptyReportRow(row: MarketingDailyReportRow): MarketingDailyReportRow {
  return {
    ...row,
    contactedCount: 0,
    newMemberCount: 0,
    depositAmount: 0,
    startedWorkCount: 0,
    note: null,
    status: 'draft',
    submittedAt: null,
    approvedBy: null,
    approvedAt: null,
    rejectedReason: null,
    voidReason: null,
  };
}
