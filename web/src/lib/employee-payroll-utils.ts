import type { EmployeePayrollHistoryItem } from '../api/employee-payroll';

export const PAYROLL_STATUS_LABELS: Record<string, string> = {
  draft: 'ร่าง',
  calculated: 'คำนวณแล้ว',
  approved: 'อนุมัติแล้ว',
  paid: 'จ่ายแล้ว',
  cancelled: 'ยกเลิก',
};

export const SALARY_TYPE_LABELS: Record<string, string> = {
  monthly: 'รายเดือน',
  daily: 'รายวัน',
};

export function payrollStatusLabel(status: string): string {
  return PAYROLL_STATUS_LABELS[status] ?? status;
}

export function payrollStatusVariant(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'paid':
    case 'approved':
      return 'success';
    case 'calculated':
      return 'info';
    case 'draft':
      return 'neutral';
    case 'cancelled':
      return 'danger';
    default:
      return 'neutral';
  }
}

export function salaryTypeLabel(type: string): string {
  return SALARY_TYPE_LABELS[type] ?? type;
}

export function formatPayrollMoney(value: number | null): string {
  if (value == null) return '—';
  return `${value.toLocaleString('th-TH', { maximumFractionDigits: 0 })} บาท`;
}

export function formatPayPeriod(start: string, end: string): string {
  return `${start} – ${end}`;
}

export function filterPayrollHistory(
  items: EmployeePayrollHistoryItem[],
  filters: { year: string; status: string; search: string },
): EmployeePayrollHistoryItem[] {
  const query = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.year && !item.payDate.startsWith(`${filters.year}-`)) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (!query) return true;
    const haystack = [
      item.periodStart,
      item.periodEnd,
      item.payDate,
      item.status,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function payrollYearOptions(items: EmployeePayrollHistoryItem[], fallbackYear: number): string[] {
  const years = new Set(items.map((item) => item.payDate.slice(0, 4)));
  years.add(String(fallbackYear));
  return [...years].sort((a, b) => Number(b) - Number(a));
}
