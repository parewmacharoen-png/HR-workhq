// ============================================================================
// modules/attendance/application/dto/absence.dto.ts
// ============================================================================

import { IsDateString, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

export class ListAbsencesQueryDto {
  @IsUUID() companyId!: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() employeeId?: string;
}

export class ApproveAbsenceDto {
  @IsDateString() contactAttemptedAt!: string;
  @IsString() @MinLength(10) contactNotes!: string;
}

export class WaiveAbsenceDto {
  @IsString() @MinLength(3) reason!: string;
}

export class DisputeAbsenceDto {
  @IsString() @MinLength(3) reason!: string;
}

export class RunAbsenceFlagDto {
  @IsUUID() companyId!: string;
  @IsDateString() workDate!: string;
}

export interface AbsenceRecordResponse {
  id: string;
  employeeId: string;
  employeeName?: string;
  companyId: string;
  workDate: string;
  status: string;
  roleLevelSnapshot: string | null;
  positionSnapshot: string | null;
  penaltyAmount: number | null;
  penaltyExempt?: boolean;
  contactAttemptedAt: string | null;
  contactNotes: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  waivedAt: string | null;
  waiveReason: string | null;
  payrollItemId: string | null;
  flaggedReason: string;
}

export interface AbsenceListResponse {
  items: AbsenceRecordResponse[];
  total: number;
}

export interface AbsenceFlagResult {
  flaggedCount: number;
  skippedCount: number;
  offDayRecordedCount?: number;
  autoWaivedCount?: number;
}
