import { apiGet, apiPost } from './client';

const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
const TOKEN_KEY = 'workhq_token';
const COMPANY_KEY = 'workhq_company_id';

function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

function getCompanyId(): string | null {
  return localStorage.getItem(COMPANY_KEY);
}

function authHeaders(): HeadersInit {
  const token = getToken();
  const companyId = getCompanyId();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(companyId ? { 'X-Company-Id': companyId } : {}),
  };
}

async function downloadPdf(path: string, fallbackFilename: string): Promise<void> {
  const res = await fetch(`${API_BASE}${path}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`Download failed (${res.status})`);
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? fallbackFilename;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export type ManualPayrollItemCategory =
  | 'bonus'
  | 'commission'
  | 'ot'
  | 'meal_allowance'
  | 'phone_allowance'
  | 'fuel_allowance'
  | 'diligence_bonus'
  | 'travel_allowance'
  | 'other_earning'
  | 'utility_deduction'
  | 'deposit_deduction'
  | 'advance_deduction'
  | 'penalty'
  | 'tax_deduction'
  | 'other_deduction';

export type ManualPayrollScheduleType = 'one_time' | 'recurring';

export interface ManualPayrollCategoryOption {
  key: ManualPayrollItemCategory;
  labelTh: string;
  direction: 'earning' | 'deduction';
}

export const MANUAL_PAYROLL_EARNING_OPTIONS: ManualPayrollCategoryOption[] = [
  { key: 'bonus', labelTh: 'โบนัส', direction: 'earning' },
  { key: 'commission', labelTh: 'ค่าคอมมิชชั่น', direction: 'earning' },
  { key: 'ot', labelTh: 'OT', direction: 'earning' },
  { key: 'meal_allowance', labelTh: 'ค่าข้าว', direction: 'earning' },
  { key: 'phone_allowance', labelTh: 'ค่าโทรศัพท์', direction: 'earning' },
  { key: 'fuel_allowance', labelTh: 'ค่าน้ำมัน', direction: 'earning' },
  { key: 'diligence_bonus', labelTh: 'เบี้ยขยัน', direction: 'earning' },
  { key: 'travel_allowance', labelTh: 'ค่าเดินทาง', direction: 'earning' },
  { key: 'other_earning', labelTh: 'ค่าอื่นๆ', direction: 'earning' },
];

export const MANUAL_PAYROLL_DEDUCTION_OPTIONS: ManualPayrollCategoryOption[] = [
  { key: 'utility_deduction', labelTh: 'หักค่าไฟ', direction: 'deduction' },
  { key: 'deposit_deduction', labelTh: 'หักประกัน', direction: 'deduction' },
  { key: 'advance_deduction', labelTh: 'เงินเบิก', direction: 'deduction' },
  { key: 'penalty', labelTh: 'ค่าปรับ', direction: 'deduction' },
  { key: 'tax_deduction', labelTh: 'หักภาษี', direction: 'deduction' },
  { key: 'other_deduction', labelTh: 'หักอื่นๆ', direction: 'deduction' },
];

export interface CreateManualPayrollItemPayload {
  companyId: string;
  employeeId: string;
  category: ManualPayrollItemCategory;
  amount: number;
  scheduleType: ManualPayrollScheduleType;
  effectiveFrom: string;
  effectiveUntil?: string;
  note?: string;
  applyToCycleId?: string;
}

export interface ManualPayrollItemDefinition {
  id: string;
  companyId: string;
  employeeId: string;
  category: ManualPayrollItemCategory;
  categoryLabelTh: string;
  direction: 'earning' | 'deduction';
  amount: number;
  scheduleType: ManualPayrollScheduleType;
  effectiveFrom: string;
  effectiveUntil: string | null;
  note: string | null;
  status: string;
}

export function createManualPayrollItem(payload: CreateManualPayrollItemPayload) {
  return apiPost<ManualPayrollItemDefinition>('/payroll/manual-items', payload);
}

export function listManualPayrollItems(companyId: string, employeeId?: string) {
  return apiGet<ManualPayrollItemDefinition[]>('/payroll/manual-items', {
    companyId,
    ...(employeeId ? { employeeId } : {}),
  });
}

export function downloadPayrollSummaryPdf(cycleId: string) {
  return downloadPdf(`/payroll/cycles/${cycleId}/export-summary.pdf`, `payroll-summary-${cycleId.slice(0, 8)}.pdf`);
}

export function downloadPayslipPdf(cycleId: string, employeeId: string) {
  return downloadPdf(
    `/payroll/cycles/${cycleId}/payslips/${employeeId}.pdf`,
    `payslip-${employeeId.slice(0, 8)}.pdf`,
  );
}

export function downloadConsolidatedPayslipPdf(employeeId: string, cycleId: string) {
  return downloadPdf(
    `/payroll/employees/${employeeId}/consolidated-payslip.pdf?cycleId=${encodeURIComponent(cycleId)}`,
    `payslip-consolidated-${employeeId.slice(0, 8)}.pdf`,
  );
}
