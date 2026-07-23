// ============================================================================
// modules/payroll/application/dto/payroll-overview.dto.ts
// PAY-007
// ============================================================================

import { IsOptional, IsString, IsUUID } from 'class-validator';
import type { PayrollOverviewExceptionReason } from '../../domain/payroll-overview.exceptions';

export class PayrollOverviewQueryDto {
  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsUUID()
  teamId?: string;

  @IsOptional()
  @IsString()
  department?: string;

  @IsOptional()
  @IsString()
  position?: string;

  @IsOptional()
  @IsString()
  employmentStatus?: string;

  @IsOptional()
  @IsString()
  payrollStatus?: string;
}

export interface PayrollOverviewSummary {
  totalEmployees: number;
  totalBaseSalary: number;
  totalMealAllowance: number;
  totalOtAmount: number;
  totalCommissionAmount: number;
  totalBonusAmount: number;
  totalDeductionAmount: number;
  totalAdvanceDeductionAmount: number;
  totalNetPayAmount: number;
  missingBankAccountCount: number;
  zeroOrNegativeNetPayCount: number;
  pendingAdjustmentCount: number;
}

export interface PayrollOverviewEmployeeRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  companyName: string;
  department: string | null;
  teamName: string | null;
  position: string | null;
  hireDate: string;
  tenureDisplay: string;
  baseSalary: number;
  mealAllowance: number;
  mealEligibleDays: number;
  crossBorderAllowance: number;
  crossBorderEligibleDays: number;
  otAmount: number;
  commissionAmount: number;
  bonusAmount: number;
  lateDeduction: number;
  absenceDeduction: number;
  leaveDeduction: number;
  advanceDeduction: number;
  deposit: number;
  otherDeduction: number;
  totalDeduction: number;
  netPayAmount: number;
  payrollStatus: string;
  bankName: string | null;
  bankAccountNoMasked: string | null;
  bankAccountName: string | null;
  notes: string[];
  hasException: boolean;
  exceptionReasons: PayrollOverviewExceptionReason[];
}

export interface PayrollOverviewComponentLine {
  id: string;
  itemType: string;
  amount: number;
  note: string | null;
  approved: boolean;
  manualOverride: boolean;
}

export interface PayrollOverviewAdvanceLine {
  advanceRequestId: string;
  amount: number;
  status: string;
  recoveredInCycle: boolean;
  note: string | null;
}

export interface PayrollOverviewEmployeeDetail {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  cycleId: string;
  companyId: string;
  cycleStatus: string;
  canEditItems: boolean;
  salaryComponents: PayrollOverviewComponentLine[];
  deductions: PayrollOverviewComponentLine[];
  overtime: PayrollOverviewComponentLine[];
  commission: PayrollOverviewComponentLine[];
  advancePay: PayrollOverviewAdvanceLine[];
  payrollNotes: string[];
  historyLink: string | null;
  row: PayrollOverviewEmployeeRow;
}

export interface PayrollOverviewResponse {
  cycleId: string;
  companyId: string;
  companyName: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  cycleStatus: string;
  canExportBankTransfer: boolean;
  summary: PayrollOverviewSummary;
  employees: PayrollOverviewEmployeeRow[];
  exceptions: PayrollOverviewEmployeeRow[];
}
