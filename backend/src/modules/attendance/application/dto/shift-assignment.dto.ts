// ============================================================================
// modules/attendance/application/dto/shift-assignment.dto.ts
// ============================================================================

import { IsBoolean, IsDateString, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class ScheduleShiftAssignmentDto {
  @IsUUID() companyId!: string;
  @IsUUID() shiftId!: string;
  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveTo?: string | null;
  @IsOptional() @IsString() @MaxLength(512) reason?: string;
}

export class CreateShiftDto {
  @IsString() @MaxLength(120) name!: string;
  @IsInt() @Min(0) @Max(1439) startMinutes!: number;
  @IsInt() @Min(0) @Max(1439) endMinutes!: number;
  @IsOptional() @IsBoolean() crossesMidnight?: boolean;
}

export class UpdateShiftDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1439) startMinutes?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1439) endMinutes?: number;
  @IsOptional() @IsBoolean() crossesMidnight?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
