// ============================================================================
// modules/payroll/application/dto/payroll-builder.dto.ts
// ============================================================================

export interface PayrollBuilderEmployeePreview {
  employeeId: string;
  globalId: string;
  employeeName: string;
  workCategory: 'office' | 'wfh';
  officeDays: number;
  wfhDays: number;
  salary: number;
  mealAllowance: number;
  crossBorderAllowance: number;
  lateDeduction: number;
  absenceDeduction: number;
  leaveBonus: number;
  overtime: number;
  commission: number;
  manualAdjustments: number;
  deposit: number;
  depositDeferred: boolean;
  gross: number;
  deductions: number;
  net: number;
  salaryMonthlyBase: number | null;
  salaryDays: number;
  salaryPeriodDays: number;
  mealEligibleDays: number;
  /** Office check-in days used for cross-border allowance. */
  crossBorderEligibleDays: number;
  warnings: string[];
  payrollAllocationMode?: 'standard' | 'shared_across_companies';
}

export interface PayrollBuilderPreviewTotals {
  employeeCount: number;
  totalBaseSalary: number;
  totalMealAllowance: number;
  totalCrossBorderAllowance: number;
  totalLateDeductions: number;
  totalAbsenceDeductions: number;
  totalLeaveBonus: number;
  totalOvertime: number;
  totalCommission: number;
  totalManualAdjustments: number;
  totalDepositDeduction: number;
  estimatedGross: number;
  estimatedDeductions: number;
  estimatedNet: number;
}

export interface PayrollBuilderPreviewResponse {
  cycleId: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: string;
  totals: PayrollBuilderPreviewTotals;
  employees: PayrollBuilderEmployeePreview[];
  warnings: string[];
}

export interface PayrollBuilderResultResponse {
  cycleId: string;
  employeesProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  totalsByItemType: Record<string, number>;
  warnings: string[];
}
