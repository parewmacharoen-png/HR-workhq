import { apiGet, apiPost } from './client';

export type PayrollExportExceptionFlag =
  | 'missing_bank_account'
  | 'net_pay_non_positive'
  | 'pending_adjustment';

export interface PayrollExportComponentSnapshot {
  itemType: string;
  amount: number;
  note: string | null;
}

export interface PayrollExportItem {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string | null;
  teamName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  netPayAmount: number;
  payrollComponents: PayrollExportComponentSnapshot[];
  exportStatus: 'included' | 'exception' | 'excluded';
  exceptionFlags: PayrollExportExceptionFlag[];
}

export interface PayrollExportBatch {
  id: string;
  payrollCycleId: string;
  companyId: string;
  exportedBy: string;
  exportedAt: string;
  status: 'completed' | 'cancelled';
  includedCount: number;
  exceptionCount: number;
  totalNetPayAmount: number;
  ownerConfirmedExceptions: boolean;
  ownerConfirmedBy: string | null;
  ownerConfirmedAt: string | null;
  regeneratedFromBatchId: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  items: PayrollExportItem[];
}

export interface PayrollExportPreview {
  cycleId: string;
  companyId: string;
  cycleStatus: string;
  canExport: boolean;
  blockedReason: string | null;
  includedCount: number;
  exceptionCount: number;
  totalNetPayAmount: number;
  items: PayrollExportItem[];
  exceptions: PayrollExportItem[];
}

export function fetchPayrollExportPreview(cycleId: string): Promise<PayrollExportPreview> {
  return apiGet<PayrollExportPreview>(`/payroll/cycles/${cycleId}/export-bank-transfer/preview`);
}

export function createPayrollExportBatch(
  cycleId: string,
  body: { confirmExceptions?: boolean; regenerateFromBatchId?: string } = {},
): Promise<PayrollExportBatch> {
  return apiPost<PayrollExportBatch>(`/payroll/cycles/${cycleId}/export-bank-transfer`, body);
}

export function fetchPayrollExportBatches(cycleId: string): Promise<PayrollExportBatch[]> {
  return apiGet<PayrollExportBatch[]>(`/payroll/cycles/${cycleId}/export-batches`);
}

export function fetchPayrollExportBatch(batchId: string): Promise<PayrollExportBatch> {
  return apiGet<PayrollExportBatch>(`/payroll/export-batches/${batchId}`);
}

export async function downloadPayrollExportBatch(batchId: string, format: 'xlsx' | 'csv'): Promise<void> {
  const API_BASE = import.meta.env.VITE_API_BASE ?? '/api/v1';
  const token = localStorage.getItem('workhq_token');
  const res = await fetch(`${API_BASE}/payroll/export-batches/${batchId}/download?format=${format}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error(await res.text());

  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="([^"]+)"/);
  const filename = match?.[1] ?? `payroll-export.${format}`;
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function cancelPayrollExportBatch(batchId: string): Promise<PayrollExportBatch> {
  return apiPost<PayrollExportBatch>(`/payroll/export-batches/${batchId}/cancel`, {});
}

const EXCEPTION_LABELS: Record<PayrollExportExceptionFlag, string> = {
  missing_bank_account: 'ไม่มีบัญชีธนาคาร',
  net_pay_non_positive: 'ยอดสุทธิ ≤ 0',
  pending_adjustment: 'รออนุมัติรายการปรับ',
};

export function formatExportException(flag: PayrollExportExceptionFlag): string {
  return EXCEPTION_LABELS[flag] ?? flag;
}
