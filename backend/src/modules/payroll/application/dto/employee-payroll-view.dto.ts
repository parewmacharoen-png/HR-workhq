export type EmployeePayrollSalaryType = 'monthly' | 'daily';

export type EmployeePayrollHistoryStatus =
  | 'draft'
  | 'calculated'
  | 'approved'
  | 'paid'
  | 'cancelled';

export interface EmployeePayrollSummaryDto {
  currentSalary: number | null;
  salaryType: EmployeePayrollSalaryType;
  salaryEffectiveFrom: string | null;
  lastPayrollDate: string | null;
  latestNetPay: number | null;
  latestBaseSalary: number | null;
  payrollStatus: EmployeePayrollHistoryStatus | null;
  payPeriod: string | null;
  salaryReviewDue: boolean;
  advanceDeductionTotal: number;
  salaryNeedsRebuild: boolean;
  salaryEffectiveAfterPeriod: boolean;
  payrollAllocationMode?: 'standard' | 'shared_across_companies';
  masterMonthlySalary?: number | null;
  perCompanySalary?: number | null;
  activeCompanyCount?: number;
  depositCollectionCompanyId?: string | null;
}

export interface EmployeePayrollHistoryItemDto {
  id: string;
  payrollCycleId: string;
  payslipId: string | null;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  baseSalary: number;
  mealAllowance: number;
  mealEligibleDays: number;
  crossBorderAllowance: number;
  crossBorderEligibleDays: number;
  lateDeduction: number;
  absenceDeduction: number;
  deposit: number;
  grossPay: number;
  otAmount: number;
  commissionAmount: number;
  bonusAmount: number;
  deductions: number;
  advanceDeduction: number;
  netPay: number;
  status: EmployeePayrollHistoryStatus;
}

export interface EmployeePayrollViewDto {
  summary: EmployeePayrollSummaryDto;
  history: EmployeePayrollHistoryItemDto[];
}
