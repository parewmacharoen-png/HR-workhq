// ============================================================================
// modules/marketing/domain/repositories/marketing-daily-report.repository.ts
// ============================================================================

import { MarketingDailyReportStatus } from '@prisma/client';
import {
  MarketingDailyReportTotals,
  MarketingKpiCountMode,
} from '../services/marketing-kpi-aggregation.service';

export const MARKETING_DAILY_REPORT_REPOSITORY = Symbol('MARKETING_DAILY_REPORT_REPOSITORY');

export interface MarketingDailyReportRow {
  id: string;
  companyId: string;
  employeeId: string;
  reportDate: Date;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  note: string | null;
  status: MarketingDailyReportStatus;
  submittedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  voidReason: string | null;
}

export interface UpsertMarketingDailyReportInput {
  companyId: string;
  employeeId: string;
  reportDate: Date;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  note?: string | null;
  actorUserId: string;
}

export interface MarketingDailyReportListFilters {
  companyId: string;
  teamId?: string;
  employeeId?: string;
  status?: MarketingDailyReportStatus;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export interface MarketingDailyReportListRow extends MarketingDailyReportRow {
  employeeName: string;
  teamName: string | null;
}

export interface MarketingDailyReportRepository {
  findById(id: string): Promise<MarketingDailyReportRow | null>;
  findLatestByEmployee(companyId: string, employeeId: string): Promise<MarketingDailyReportRow | null>;
  findByEmployeeAndDate(
    companyId: string,
    employeeId: string,
    reportDate: Date,
  ): Promise<MarketingDailyReportRow | null>;
  listReports(filters: MarketingDailyReportListFilters): Promise<MarketingDailyReportListRow[]>;
  upsertDraft(input: UpsertMarketingDailyReportInput): Promise<MarketingDailyReportRow>;
  updateDraft(
    id: string,
    input: Omit<UpsertMarketingDailyReportInput, 'companyId' | 'employeeId' | 'reportDate'>,
  ): Promise<MarketingDailyReportRow>;
  updateFields(
    id: string,
    input: Omit<UpsertMarketingDailyReportInput, 'companyId' | 'employeeId' | 'reportDate'>,
  ): Promise<MarketingDailyReportRow>;
  saveStatus(
    id: string,
    patch: Partial<MarketingDailyReportRow> & { status: MarketingDailyReportStatus },
    actorUserId: string,
  ): Promise<MarketingDailyReportRow>;
  listEmployeeReportsInPeriod(
    companyId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    mode: MarketingKpiCountMode,
  ): Promise<MarketingDailyReportTotals[]>;
  sumEmployeeStartedWork(
    companyId: string,
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    mode: MarketingKpiCountMode,
  ): Promise<number>;
  listTeamEmployeeIds(teamId: string, companyId: string, asOf?: Date): Promise<string[]>;
}
