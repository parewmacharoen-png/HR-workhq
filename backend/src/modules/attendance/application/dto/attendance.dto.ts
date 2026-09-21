// ============================================================================
// modules/attendance/application/dto/attendance.dto.ts
// ============================================================================

import {
  IsDateString, IsEnum, IsLatitude, IsLongitude, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';

export class CheckInDto {
  @IsUUID() companyId!: string;
  /** Base hourly rate for late deduction (from payroll/formula). */
  @IsOptional() @IsNumber() @Min(0) hourlyRate?: number;
  /** Per-day work location (defaults to employee profile). */
  @IsOptional() @IsEnum(['office', 'wfh'] as const) workCategory?: 'office' | 'wfh';
  /** ATT-LOC — GPS at time of check-in. Mandatory: used to capture/verify the WFH home baseline. */
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
}

export class CheckOutDto {
  @IsUUID() companyId!: string;
  /** ATT-LOC — GPS at time of check-out. Mandatory: verified against the WFH home baseline. */
  @IsLatitude() latitude!: number;
  @IsLongitude() longitude!: number;
}

export class SubmitOvertimeDto {
  @IsUUID() companyId!: string;
  @IsUUID() attendanceRecordId!: string;
  @IsOptional() @IsDateString() otEndAt?: string;
  @IsOptional() @IsString() reason?: string;
}

export interface AttendanceResponse {
  id: string;
  employeeId: string;
  companyId: string;
  workDate: string;
  workCategory: 'office' | 'wfh';
  shiftId: string | null;
  shiftName: string | null;
  shiftStartAt: string | null;
  shiftEndAt: string | null;
  checkInAt: string | null;
  checkOutAt: string | null;
  lateMinutes: number;
  roundedLateHours: number;
  lateDeduction: number;
  workedMinutes: number;
  status: string;
}

export interface CheckOutResult extends AttendanceResponse {
  overtime: { otHours: number; amount: number; workflowInstanceId: string | null } | null;
}
