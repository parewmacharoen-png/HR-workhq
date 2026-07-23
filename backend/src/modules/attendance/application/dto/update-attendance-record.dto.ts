// ============================================================================
// Direct attendance record update by HR / leadership (no approval workflow).
// ============================================================================

import {
  IsEnum,
  IsISO8601,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class UpdateAttendanceRecordDto {
  @IsUUID() companyId!: string;

  @IsString() @MaxLength(500) reason!: string;

  @IsOptional() @IsISO8601() checkInAt?: string | null;

  @IsOptional() @IsISO8601() checkOutAt?: string | null;

  @IsOptional() @IsNumber() @Min(0) @Max(24 * 60) breakMinutes?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(24) workedHours?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(24 * 60) lateMinutes?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(24) otHours?: number;

  @IsOptional() @IsEnum(['day', 'night'] as const) shift?: 'day' | 'night';

  @IsOptional() @IsEnum(['office', 'wfh'] as const) workCategory?: 'office' | 'wfh';
}

export interface UpdateAttendanceRecordResponse {
  id: string;
}
