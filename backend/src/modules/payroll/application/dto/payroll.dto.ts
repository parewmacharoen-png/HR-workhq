// ============================================================================
// modules/payroll/application/dto/payroll.dto.ts
// ============================================================================

import {
  IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID,
} from 'class-validator';

export class OpenPayrollCycleDto {
  @IsUUID()    companyId!: string;
  @IsDateString() periodStart!: string;   // 25th prev month
  @IsDateString() periodEnd!: string;     // 23rd curr month
  @IsDateString() payDate!: string;       // 25th curr month
}

export class AddPayrollItemDto {
  @IsUUID()   employeeId!: string;

  @IsEnum([
    'salary','ot','meal_allowance','cross_border',
    'bonus','leave_bonus','late_deduction','absence_deduction','excess_off_deduction','break_deduction','consecutive_leave_deduction','commission','referral','deposit','manual_adjustment',
  ] as const)
  itemType!: string;

  @IsNumber() amount!: number;

  @IsOptional() @IsNumber()  quantity?: number;
  @IsOptional() @IsString()  note?: string;
  @IsOptional() @IsUUID()    sourceRefId?: string;
  @IsOptional() @IsString()  sourceRefType?: string;
}

export class UpdatePayrollItemDto {
  @IsNumber() amount!: number;

  @IsOptional() @IsString() note?: string;
}

export class AddDepositDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
}

export class AddLeaveBonusDto {
  @IsUUID() employeeId!: string;
  /** Owner-approved override when staffing prevented off-day usage (allows bonus above normal cap). */
  @IsOptional() @IsBoolean() overrideApproved?: boolean;
  @IsOptional() @IsString() overrideReason?: string;
}

export class PayrollEmployeeActionDto {
  @IsUUID() employeeId!: string;
}

export interface LeaveBonusResponse {
  id: string | null;
  usedOffDays: number;
  eligibleBonusDays: number;
  bonusAmount: number;
  overrideApproved: boolean;
  capped: boolean;
  skipped: boolean;
}

export interface MealAllowanceResponse {
  id: string | null;
  workCategory: 'office' | 'wfh';
  workingDays: number;
  offDayLeaveDays: number;
  eligibleDays: number;
  ratePerDay: number;
  amount: number;
  skipped: boolean;
}

export interface LateDeductionResponse {
  id: string | null;
  totalDeduction: number;
  sourceCount: number;
  sources: Array<{ attendanceRecordId: string; workDate: string; amount: number }>;
  skipped: boolean;
}

export interface AbsenceDeductionResponse {
  id: string | null;
  totalDeduction: number;
  sourceCount: number;
  sources: Array<{ absenceRecordId: string; workDate: string; amount: number; roleLevel: string | null }>;
  skipped: boolean;
}

export interface CycleResponse {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: string;
}

export interface PayslipResponse {
  id: string;
  employeeId: string;
  gross: number;
  deductions: number;
  net: number;
  breakdown: Record<string, number>;
}
