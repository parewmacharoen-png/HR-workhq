import type { EmployeeCommissionHistoryItem } from '../api/employee-commission';

export const COMMISSION_STATUS_LABELS: Record<string, string> = {
  pending_pay: 'รอจ่าย',
  paid: 'จ่ายแล้ว',
  carried_forward: 'ยกยอด',
  no_payout: 'ไม่มีการจ่าย',
  calculated: 'คำนวณแล้ว',
  finalized: 'สรุปแล้ว',
  approved: 'อนุมัติแล้ว',
  submitted: 'ส่งแล้ว',
  hr_review: 'HR ตรวจ',
  rejected: 'ปฏิเสธ',
  draft: 'ร่าง',
};

export const COMMISSION_TYPE_LABELS: Record<string, string> = {
  marketing: 'Marketing',
  admin: 'Admin',
};

export function commissionStatusLabel(status: string): string {
  return COMMISSION_STATUS_LABELS[status] ?? status;
}

export function commissionTypeLabel(type: string): string {
  return COMMISSION_TYPE_LABELS[type] ?? type;
}

export function commissionStatusVariant(
  uiStatus: string,
): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (uiStatus) {
    case 'eligible':
    case 'paid':
      return 'success';
    case 'pending':
      return 'warning';
    case 'carry_forward':
      return 'info';
    case 'rejected':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function formatCommissionMoney(value: number | null | undefined): string {
  if (value == null) return '—';
  return `${value.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท`;
}

export function filterCommissionHistory(
  items: EmployeeCommissionHistoryItem[],
  filters: { year: string; company: string; commissionType: string; status: string; search: string },
): EmployeeCommissionHistoryItem[] {
  const query = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.year && !item.periodStart.startsWith(`${filters.year}-`)) return false;
    if (filters.company && item.companyName !== filters.company) return false;
    if (filters.commissionType && item.commissionType !== filters.commissionType) return false;
    if (filters.status && item.uiStatus !== filters.status) return false;
    if (!query) return true;
    const haystack = [
      item.periodLabel,
      item.companyName,
      item.teamName ?? '',
      item.method,
      item.commissionType,
      item.status,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function commissionYearOptions(
  items: EmployeeCommissionHistoryItem[],
  fallbackYear: number,
): string[] {
  const years = new Set(items.map((item) => item.periodStart.slice(0, 4)));
  years.add(String(fallbackYear));
  return [...years].sort((a, b) => Number(b) - Number(a));
}

export function commissionCompanyOptions(items: EmployeeCommissionHistoryItem[]): string[] {
  return [...new Set(items.map((item) => item.companyName))].sort();
}
