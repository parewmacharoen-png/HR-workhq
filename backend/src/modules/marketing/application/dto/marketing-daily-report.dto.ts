// ============================================================================
// modules/marketing/application/dto/marketing-daily-report.dto.ts
// ============================================================================

import {
  IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CreateMarketingDailyReportDto {
  @IsUUID() companyId!: string;
  @IsDateString() reportDate!: string;
  @IsInt() @Min(0) contactedCount!: number;
  @IsInt() @Min(0) newMemberCount!: number;
  @IsNumber() @Min(0) depositAmount!: number;
  @IsInt() @Min(0) startedWorkCount!: number;
  @IsOptional() @IsString() note?: string;
}

export class UpdateMarketingDailyReportDto {
  @IsOptional() @IsInt() @Min(0) contactedCount?: number;
  @IsOptional() @IsInt() @Min(0) newMemberCount?: number;
  @IsOptional() @IsNumber() @Min(0) depositAmount?: number;
  @IsOptional() @IsInt() @Min(0) startedWorkCount?: number;
  @IsOptional() @IsString() note?: string;
}

export class RejectMarketingDailyReportDto {
  @IsString() rejectedReason!: string;
}

export class VoidMarketingDailyReportDto {
  @IsString() voidReason!: string;
}

export interface MarketingDailyReportResponse {
  id: string;
  companyId: string;
  employeeId: string;
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
}
