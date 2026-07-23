import { apiGet, apiPost } from './client';

export type PayrollOverviewExceptionReason =
  | 'missing_bank_account'
  | 'missing_bank_account_name'
  | 'net_pay_non_positive'
  | 'pending_adjustment'
  | 'payroll_item_not_approved'
  | 'inactive_without_exit_settlement';

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

export interface PayrollOverviewComponentLine {
  id: string;
  itemType: string;
  amount: number;
  note: string | null;
  approved: boolean;
  manualOverride: boolean;
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
  advancePay: Array<{
    advanceRequestId: string;
    amount: number;
    status: string;
    recoveredInCycle: boolean;
    note: string | null;
  }>;
  payrollNotes: string[];
  historyLink: string | null;
  row: PayrollOverviewEmployeeRow;
}

export interface PayrollOverviewFilters {
  companyId?: string;
  teamId?: string;
  department?: string;
  position?: string;
  employmentStatus?: string;
  payrollStatus?: string;
}

export function fetchPayrollOverview(
  cycleId: string,
  filters: PayrollOverviewFilters = {},
): Promise<PayrollOverviewResponse> {
  const { companyId, teamId, department, position, employmentStatus, payrollStatus } = filters;
  return apiGet<PayrollOverviewResponse>(`/payroll/cycles/${cycleId}/overview`, {
    companyId,
    teamId,
    department,
    position,
    employmentStatus,
    payrollStatus,
  });
}

export function fetchPayrollOverviewEmployeeDetail(
  cycleId: string,
  employeeId: string,
): Promise<PayrollOverviewEmployeeDetail> {
  return apiGet<PayrollOverviewEmployeeDetail>(`/payroll/cycles/${cycleId}/overview/employees/${employeeId}`);
}

export function logPayrollOverviewExportInitiated(cycleId: string): Promise<{ logged: true }> {
  return apiPost<{ logged: true }>(`/payroll/cycles/${cycleId}/overview/log-export-initiated`, {});
}

const EXCEPTION_LABELS: Record<PayrollOverviewExceptionReason, string> = {
  missing_bank_account: 'ไม่มีบัญชีธนาคาร',
  missing_bank_account_name: 'ไม่มีชื่อบัญชี',
  net_pay_non_positive: 'ยอดสุทธิ ≤ 0',
  pending_adjustment: 'รออนุมัติรายการปรับ',
  payroll_item_not_approved: 'รายการยังไม่อนุมัติ',
  inactive_without_exit_settlement: 'พ้นสภาพแต่ยังไม่ปิดงานออก',
};

export function formatOverviewException(reason: PayrollOverviewExceptionReason): string {
  return EXCEPTION_LABELS[reason] ?? reason;
}
