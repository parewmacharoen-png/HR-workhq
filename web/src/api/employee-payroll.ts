import { apiGet, apiPost } from './client';

export type EmployeePayrollSalaryType = 'monthly' | 'daily';

export type EmployeePayrollHistoryStatus =
  | 'draft'
  | 'calculated'
  | 'approved'
  | 'paid'
  | 'cancelled';

export interface EmployeePayrollSummary {
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

export interface EmployeePayrollHistoryItem {
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

export interface EmployeePayrollResponse {
  summary: EmployeePayrollSummary;
  history: EmployeePayrollHistoryItem[];
}

export function fetchEmployeePayroll(employeeId: string, companyId: string) {
  return apiGet<EmployeePayrollResponse>(
    `/employees/${employeeId}/payroll?companyId=${encodeURIComponent(companyId)}`,
  );
}

export function syncEmployeePayrollOpenCycles(employeeId: string, companyId: string) {
  return apiPost<{ cyclesSynced: number; warnings: string[] }>(
    `/employees/${employeeId}/payroll/sync-open-cycles?companyId=${encodeURIComponent(companyId)}`,
    {},
  );
}
