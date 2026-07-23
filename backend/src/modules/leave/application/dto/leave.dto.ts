// ============================================================================
// modules/leave/application/dto/leave.dto.ts
// ============================================================================

import {
  IsBoolean, IsDateString, IsInt, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength,
} from 'class-validator';

export class RequestLeaveDto {
  @IsUUID() companyId!: string;
  @IsString() leaveTypeCode!: string;
  @IsDateString() startDate!: string;
  @IsDateString() endDate!: string;
  @IsNumber() @Min(0.5) days!: number;
  @IsOptional() @IsBoolean() isBorrowed?: boolean;
  @IsOptional() @IsString() reason?: string;
}

export class UpdateLeaveRequestDto {
  @IsOptional() @IsString() leaveTypeCode?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsNumber() @Min(0.5) days?: number;
  @IsOptional() @IsString() reason?: string;
  @IsString() @MinLength(3) correctionReason!: string;
}

export class ConvertHolidayDto {
  @IsUUID() companyId!: string;
  @IsUUID() payrollCycleId!: string;
  @IsInt() @Min(0) unusedDays!: number;
  @IsOptional() @IsBoolean() overrideCap?: boolean;
  @IsOptional() @IsNumber() @Min(0) customCap?: number;
}

export interface LeaveRequestResponse {
  id: string;
  status: string;
  workflowInstanceId: string | null;
  isBorrowed: boolean;
  startDate?: string;
  endDate?: string;
  days?: number;
  rescheduleCount?: number;
  conflictWarning?: string | null;
  overlappingCount?: number;
}

export interface ApprovedLeaveSummaryResponse {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  rescheduleCount: number;
  leaveTypeName: string;
}

export class RequestLeaveRescheduleDto {
  @IsUUID() companyId!: string;
  @IsUUID() leaveRequestId!: string;
  @IsDateString() newStartDate!: string;
  @IsString() @MinLength(10) reason!: string;
  @IsOptional() @IsBoolean() isEmergency?: boolean;
}

export class RequestLeaveShiftSwapDto {
  @IsUUID() companyId!: string;
  @IsUUID() requesterLeaveRequestId!: string;
  @IsUUID() partnerLeaveRequestId!: string;
}

export interface LeaveRescheduleResponse {
  id: string;
  status: string;
  workflowInstanceId: string | null;
  leaveRequestId: string;
  newStartDate: string;
  newEndDate: string;
}

export interface LeaveShiftSwapResponse {
  id: string;
  status: string;
  workflowInstanceId: string | null;
}

export interface HolidayConversionResponse {
  id: string;
  unusedDays: number;
  bonusAmount: number;
  overrideCap: boolean;
}

export interface LeaveBalanceSummaryResponse {
  leaveTypeCode: string;
  leaveTypeName: string;
  entitled: number;
  used: number;
  remaining: number;
  periodStart: string;
}
