import { apiDelete, apiGet, apiPatch, apiPost } from './client';

export interface PayrollCycle {
  id: string;
  companyId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
  status: string;
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
  gross: number;
  deductions: number;
  net: number;
  salaryMonthlyBase: number | null;
  salaryDays: number;
  salaryPeriodDays: number;
  mealEligibleDays: number;
  crossBorderEligibleDays: number;
  warnings: string[];
  payrollAllocationMode?: 'standard' | 'shared_across_companies';
}

export interface PayrollBuilderPreview {
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

export interface PayrollBuilderResult {
  cycleId: string;
  employeesProcessed: number;
  itemsCreated: number;
  itemsUpdated: number;
  itemsSkipped: number;
  totalsByItemType: Record<string, number>;
  warnings: string[];
}

export function fetchPayrollCycle(id: string): Promise<PayrollCycle> {
  return apiGet<PayrollCycle>(`/payroll/cycles/${id}`);
}

export function fetchPayrollBuildPreview(id: string): Promise<PayrollBuilderPreview> {
  return apiGet<PayrollBuilderPreview>(`/payroll/cycles/${id}/build-preview`);
}

export function buildPayrollCycle(id: string): Promise<PayrollBuilderResult> {
  return apiPost<PayrollBuilderResult>(`/payroll/cycles/${id}/build`, {});
}

export function lockPayrollCycle(id: string): Promise<PayrollCycle> {
  return apiPost<PayrollCycle>(`/payroll/cycles/${id}/lock`, {});
}

export function markPayrollCyclePaid(id: string): Promise<PayrollCycle> {
  return apiPost<PayrollCycle>(`/payroll/cycles/${id}/paid`, {});
}

export function listPayrollCycles(companyId: string): Promise<PayrollCycle[]> {
  return apiGet<PayrollCycle[]>('/payroll/cycles', { companyId });
}

export interface OpenPayrollCyclePayload {
  companyId: string;
  periodStart: string;
  periodEnd: string;
  payDate: string;
}

export function openPayrollCycle(payload: OpenPayrollCyclePayload): Promise<PayrollCycle> {
  return apiPost<PayrollCycle>('/payroll/cycles', payload);
}

export interface AddPayrollItemPayload {
  employeeId: string;
  itemType: string;
  amount: number;
  note?: string;
}

export function addPayrollManualItem(cycleId: string, payload: AddPayrollItemPayload) {
  return apiPost(`/payroll/cycles/${cycleId}/items`, payload);
}

export function updatePayrollItem(
  cycleId: string,
  itemId: string,
  payload: { amount: number; note?: string },
) {
  return apiPatch<{ id: string; amount: number; note: string }>(
    `/payroll/cycles/${cycleId}/items/${itemId}`,
    payload,
  );
}

export function deletePayrollItem(cycleId: string, itemId: string) {
  return apiDelete<{ id: string }>(`/payroll/cycles/${cycleId}/items/${itemId}`);
}

export interface PayslipResponse {
  id: string;
  employeeId: string;
  gross: number;
  deductions: number;
  net: number;
  breakdown: Record<string, number>;
}

export function generatePayslip(cycleId: string, employeeId: string): Promise<PayslipResponse> {
  return apiPost<PayslipResponse>(`/payroll/cycles/${cycleId}/payslips/${employeeId}`, {});
}

export function fetchPayslip(cycleId: string, employeeId: string): Promise<PayslipResponse> {
  return apiGet<PayslipResponse>(`/payroll/cycles/${cycleId}/payslips/${employeeId}`);
}

/** Default WorkHQ payroll period: 25th prev month → 23rd current month, pay 25th current month */
export function defaultPayrollPeriodDates(reference = new Date()): OpenPayrollCyclePayload {
  const year = reference.getFullYear();
  const month = reference.getMonth();
  const pad = (n: number) => String(n).padStart(2, '0');
  const fmt = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;

  const periodStart = fmt(month === 0 ? year - 1 : year, month === 0 ? 11 : month - 1, 25);
  const periodEnd = fmt(year, month, 23);
  const payDate = fmt(year, month, 25);

  return {
    companyId: '',
    periodStart,
    periodEnd,
    payDate,
  };
}
