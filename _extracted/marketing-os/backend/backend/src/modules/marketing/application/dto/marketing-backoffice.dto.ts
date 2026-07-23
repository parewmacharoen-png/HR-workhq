// ============================================================================
// modules/marketing/application/dto/marketing-backoffice.dto.ts
// ============================================================================

import {
  IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';
import { MarketingDailyReportStatus } from '@prisma/client';

export class ListMarketingReportsQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsString() status?: MarketingDailyReportStatus;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class BackOfficePatchMarketingReportDto {
  @IsOptional() @IsInt() @Min(0) contactedCount?: number;
  @IsOptional() @IsInt() @Min(0) newMemberCount?: number;
  @IsOptional() @IsNumber() @Min(0) depositAmount?: number;
  @IsOptional() @IsInt() @Min(0) startedWorkCount?: number;
  @IsOptional() @IsString() note?: string;
  @IsString() reason!: string;
}

export class BackOfficeRejectMarketingReportDto {
  @IsString() reason!: string;
}

export class BackOfficeVoidMarketingReportDto {
  @IsString() reason!: string;
}

export class LockMarketingCycleDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() reason!: string;
}

export class UnlockMarketingCycleDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsString() reason!: string;
}

export class SearchMarketingAuditQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() reportId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() userId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class KpiReviewQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
}

export interface MarketingReportListItem {
  id: string;
  reportDate: string;
  employeeId: string;
  employeeName: string;
  teamName: string | null;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  status: string;
  submittedAt: string | null;
}

export interface MarketingReportDetailResponse {
  report: {
    id: string;
    companyId: string;
    employeeId: string;
    employeeName: string;
    teamName: string | null;
    reportDate: string;
    contactedCount: number;
    newMemberCount: number;
    depositAmount: number;
    startedWorkCount: number;
    note: string | null;
    status: string;
    submittedAt: string | null;
    approvedBy: string | null;
    approvedAt: string | null;
    rejectedReason: string | null;
    voidReason: string | null;
  };
  auditHistory: MarketingAuditLogResponse[];
  approvalHistory: MarketingAuditLogResponse[];
}

export interface MarketingAuditLogResponse {
  id: string;
  reportId: string;
  actorId: string;
  actorName: string | null;
  action: string;
  fieldName: string | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  createdAt: string;
}

export interface KpiReviewRow {
  employeeId: string;
  employeeName: string;
  teamName: string | null;
  contactedCount: number;
  newMemberCount: number;
  depositAmount: number;
  startedWorkCount: number;
  targetCount: number;
  remainingCount: number;
  conversionPercent: number;
  qualified: boolean;
  status: string;
}
