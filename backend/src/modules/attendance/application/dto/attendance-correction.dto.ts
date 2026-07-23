// ============================================================================
// modules/attendance/application/dto/attendance-correction.dto.ts
// REQ-006b
// ============================================================================

import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const CORRECTION_FIELDS = [
  'checkInAt',
  'checkOutAt',
  'breakStartAt',
  'breakEndAt',
] as const;

export type CorrectionField = (typeof CORRECTION_FIELDS)[number];

export class CreateAttendanceCorrectionDto {
  @IsUUID() companyId!: string;
  @IsIn(CORRECTION_FIELDS) field!: CorrectionField;
  /** ISO datetime for the corrected timestamp. */
  @IsISO8601() correctedAt!: string;
  @IsString() @MaxLength(500) reason!: string;
  /** Optional work date override (YYYY-MM-DD). Defaults to today Bangkok. */
  @IsOptional() @IsString() workDate?: string;
}

export interface AttendanceCorrectionResponse {
  id: string;
  attendanceRecordId: string;
  field: string;
  status: string;
  workflowInstanceId: string | null;
  reason: string | null;
}
