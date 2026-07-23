// ============================================================================
// modules/marketing/infrastructure/persistence/marketing-daily-report.prisma.repository.ts
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { MarketingDailyReportStatus, Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  MarketingDailyReportRepository,
  MarketingDailyReportRow,
  MarketingDailyReportListFilters,
  MarketingDailyReportListRow,
  UpsertMarketingDailyReportInput,
} from '../../domain/repositories/marketing-daily-report.repository';
import {
  FINAL_KPI_STATUSES,
  MarketingKpiCountMode,
  PROJECTED_KPI_STATUSES,
} from '../../domain/services/marketing-kpi-aggregation.service';
import { MarketingDailyReportNotFoundError } from '../../domain/errors/marketing.errors';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamRepository,
} from '../../domain/repositories/marketing-team.repository';

@Injectable()
export class PrismaMarketingDailyReportRepository implements MarketingDailyReportRepository {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly marketingTeams: MarketingTeamRepository,
  ) {}

  async findById(id: string): Promise<MarketingDailyReportRow | null> {
    const row = await this.prisma.marketingDailyReport.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.map(row) : null;
  }

  async findLatestByEmployee(
    companyId: string,
    employeeId: string,
  ): Promise<MarketingDailyReportRow | null> {
    const row = await this.prisma.marketingDailyReport.findFirst({
      where: { companyId, employeeId, deletedAt: null },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
    });
    return row ? this.map(row) : null;
  }

  async listReports(filters: MarketingDailyReportListFilters): Promise<MarketingDailyReportListRow[]> {
    const rows = await this.prisma.marketingDailyReport.findMany({
      where: {
        companyId: filters.companyId,
        deletedAt: null,
        employeeId: filters.employeeId ?? undefined,
        status: filters.status,
        reportDate: filters.dateFrom || filters.dateTo
          ? {
            gte: filters.dateFrom,
            lte: filters.dateTo,
          }
          : undefined,
      },
      orderBy: [{ reportDate: 'desc' }, { createdAt: 'desc' }],
      take: filters.limit ?? 200,
    });

    const filteredRows = filters.teamId
      ? (
        await Promise.all(rows.map(async (row) => {
          const teamAtDate = await this.marketingTeams.getEmployeeMarketingTeamAtDate(
            filters.companyId,
            row.employeeId,
            row.reportDate,
          );
          return teamAtDate?.teamId === filters.teamId ? row : null;
        }))
      ).filter((row): row is NonNullable<typeof row> => row !== null)
      : rows;

    if (filters.teamId && filteredRows.length === 0) return [];

    const uniqueEmployeeIds = [...new Set(filteredRows.map((r) => r.employeeId))];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: uniqueEmployeeIds }, deletedAt: null },
      select: { id: true, firstName: true, lastName: true, nickname: true },
    });
    const nameById = new Map(employees.map((e) => [
      e.id,
      e.nickname ?? `${e.firstName} ${e.lastName}`.trim(),
    ]));

    const assignments = await this.prisma.marketingTeamMember.findMany({
      where: {
        companyId: filters.companyId,
        employeeId: { in: uniqueEmployeeIds },
        deletedAt: null,
        isPrimary: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      include: { team: { select: { name: true } } },
    });
    const teamByEmployee = new Map(assignments.map((a) => [a.employeeId, a.team?.name ?? null]));

    return filteredRows.map((row) => ({
      ...this.map(row),
      employeeName: nameById.get(row.employeeId) ?? row.employeeId.slice(0, 8),
      teamName: teamByEmployee.get(row.employeeId) ?? null,
    }));
  }

  async updateFields(
    id: string,
    input: Omit<UpsertMarketingDailyReportInput, 'companyId' | 'employeeId' | 'reportDate'>,
  ): Promise<MarketingDailyReportRow> {
    const row = await this.prisma.marketingDailyReport.update({
      where: { id },
      data: {
        contactedCount: input.contactedCount,
        newMemberCount: input.newMemberCount,
        depositAmount: dec(input.depositAmount),
        startedWorkCount: input.startedWorkCount,
        note: input.note ?? undefined,
        updatedBy: input.actorUserId,
      },
    });
    return this.map(row);
  }

  async findByEmployeeAndDate(
    companyId: string,
    employeeId: string,
    reportDate: Date,
  ): Promise<MarketingDailyReportRow | null> {
    const row = await this.prisma.marketingDailyReport.findFirst({
      where: {
        companyId,
        employeeId,
        reportDate,
        deletedAt: null,
      },
    });
    return row ? this.map(row) : null;
  }

  async upsertDraft(input: UpsertMarketingDailyReportInput): Promise<MarketingDailyReportRow> {
    const existing = await this.findByEmployeeAndDate(
      input.companyId,
      input.employeeId,
      input.reportDate,
    );

    if (existing) {
      if (existing.status !== 'draft') {
        throw new Error(`Report ${existing.id} is not draft`);
      }
      return this.updateDraft(existing.id, input);
    }

    const row = await this.prisma.marketingDailyReport.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        employeeId: input.employeeId,
        reportDate: input.reportDate,
        contactedCount: input.contactedCount,
        newMemberCount: input.newMemberCount,
        depositAmount: dec(input.depositAmount),
        startedWorkCount: input.startedWorkCount,
        note: input.note ?? undefined,
        status: 'draft',
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return this.map(row);
  }

  async updateDraft(
    id: string,
    input: Omit<UpsertMarketingDailyReportInput, 'companyId' | 'employeeId' | 'reportDate'>,
  ): Promise<MarketingDailyReportRow> {
    const row = await this.prisma.marketingDailyReport.update({
      where: { id },
      data: {
        contactedCount: input.contactedCount,
        newMemberCount: input.newMemberCount,
        depositAmount: dec(input.depositAmount),
        startedWorkCount: input.startedWorkCount,
        note: input.note ?? undefined,
        updatedBy: input.actorUserId,
      },
    });
    return this.map(row);
  }

  async saveStatus(
    id: string,
    patch: Partial<MarketingDailyReportRow> & { status: MarketingDailyReportStatus },
    actorUserId: string,
  ): Promise<MarketingDailyReportRow> {
    const existing = await this.findById(id);
    if (!existing) throw new MarketingDailyReportNotFoundError(id);

    const row = await this.prisma.marketingDailyReport.update({
      where: { id },
      data: {
        status: patch.status,
        submittedAt: patch.submittedAt ?? undefined,
        approvedBy: patch.approvedBy ?? undefined,
        approvedAt: patch.approvedAt ?? undefined,
        rejectedReason: patch.rejectedReason ?? undefined,
        voidReason: patch.voidReason ?? undefined,
        updatedBy: actorUserId,
      },
    });
    return this.map(row);
  }

  async listEmployeeReportsInPeriod(
    companyId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    mode: MarketingKpiCountMode,
  ) {
    const rows = await this.prisma.marketingDailyReport.findMany({
      where: this.periodWhere(companyId, employeeId, periodStart, periodEnd, mode),
      select: {
        reportDate: true,
        contactedCount: true,
        newMemberCount: true,
        depositAmount: true,
        startedWorkCount: true,
      },
    });
    return rows.map((r) => ({
      reportDate: r.reportDate,
      contactedCount: r.contactedCount,
      newMemberCount: r.newMemberCount,
      depositAmount: Number(r.depositAmount),
      startedWorkCount: r.startedWorkCount,
    }));
  }

  async sumEmployeeStartedWork(
    companyId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    mode: MarketingKpiCountMode,
  ): Promise<number> {
    const result = await this.prisma.marketingDailyReport.aggregate({
      where: this.periodWhere(companyId, employeeId, periodStart, periodEnd, mode),
      _sum: { startedWorkCount: true },
    });
    return result._sum.startedWorkCount ?? 0;
  }

  async listTeamEmployeeIds(
    teamId: string,
    companyId: string,
    asOf: Date = new Date(),
  ): Promise<string[]> {
    return this.marketingTeams.listTeamEmployeeIds(teamId, companyId, asOf);
  }

  private periodWhere(
    companyId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    mode: MarketingKpiCountMode,
  ): Prisma.MarketingDailyReportWhereInput {
    const statuses = mode === 'final' ? FINAL_KPI_STATUSES : PROJECTED_KPI_STATUSES;
    return {
      companyId,
      employeeId,
      deletedAt: null,
      reportDate: { gte: periodStart, lte: periodEnd },
      status: { in: [...statuses] },
    };
  }

  private map(row: {
    id: string;
    companyId: string;
    employeeId: string;
    reportDate: Date;
    contactedCount: number;
    newMemberCount: number;
    depositAmount: Prisma.Decimal;
    startedWorkCount: number;
    note: string | null;
    status: MarketingDailyReportStatus;
    submittedAt: Date | null;
    approvedBy: string | null;
    approvedAt: Date | null;
    rejectedReason: string | null;
    voidReason: string | null;
  }): MarketingDailyReportRow {
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      reportDate: row.reportDate,
      contactedCount: row.contactedCount,
      newMemberCount: row.newMemberCount,
      depositAmount: Number(row.depositAmount),
      startedWorkCount: row.startedWorkCount,
      note: row.note,
      status: row.status,
      submittedAt: row.submittedAt,
      approvedBy: row.approvedBy,
      approvedAt: row.approvedAt,
      rejectedReason: row.rejectedReason,
      voidReason: row.voidReason,
    };
  }
}

function dec(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
