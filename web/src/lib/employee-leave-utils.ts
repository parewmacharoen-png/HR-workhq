import type { EmployeeLeaveHistoryItem } from '../api/employee-leave';

export const LEAVE_STATUS_LABELS: Record<string, string> = {
  pending: 'รออนุมัติ',
  approved: 'อนุมัติแล้ว',
  rejected: 'ไม่อนุมัติ',
  cancelled: 'ยกเลิก',
};

export function leaveStatusLabel(status: string): string {
  return LEAVE_STATUS_LABELS[status.toLowerCase()] ?? status;
}

export function leaveStatusVariant(status: string): 'warning' | 'success' | 'danger' | 'neutral' {
  switch (status.toLowerCase()) {
    case 'pending': return 'warning';
    case 'approved': return 'success';
    case 'rejected': return 'danger';
    case 'cancelled': return 'neutral';
    default: return 'neutral';
  }
}

export function filterLeaveHistory(
  items: EmployeeLeaveHistoryItem[],
  filters: {
    year: string;
    leaveType: string;
    status: string;
    search: string;
  },
): EmployeeLeaveHistoryItem[] {
  const query = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.year && !item.requestDate.startsWith(`${filters.year}-`)) return false;
    if (filters.leaveType && item.leaveTypeCode !== filters.leaveType) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (!query) return true;
    const haystack = [
      item.leaveTypeName,
      item.leaveTypeCode,
      item.status,
      item.reason ?? '',
      item.approverName ?? '',
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function leaveYearOptions(items: EmployeeLeaveHistoryItem[], fallbackYear: number): string[] {
  const years = new Set(items.map((item) => item.requestDate.slice(0, 4)));
  years.add(String(fallbackYear));
  return [...years].sort((a, b) => Number(b) - Number(a));
}

export function leaveTypeOptions(items: EmployeeLeaveHistoryItem[]): Array<{ code: string; name: string }> {
  const map = new Map<string, string>();
  for (const item of items) {
    map.set(item.leaveTypeCode, leaveTypeDisplayName(item));
  }
  return [...map.entries()]
    .map(([code, name]) => ({ code, name }))
    .sort((a, b) => a.name.localeCompare(b.name, 'th'));
}

/** Short label for the type column (no system notes). */
export function leaveTypeDisplayName(item: EmployeeLeaveHistoryItem): string {
  if (item.source === 'off_day_change' || item.previousDate) return 'เปลี่ยนวันหยุด';
  if (item.leaveTypeCode === 'monthly_off') return 'วันหยุดประจำเดือน';
  if (item.leaveTypeCode === 'monthly_off_change') return 'เปลี่ยนวันหยุด';
  return item.leaveTypeName;
}

/** Employee-written reason only (strip system-generated change/notice text). */
export function leaveUserReason(item: EmployeeLeaveHistoryItem): string | null {
  const reason = (item.reason ?? '').trim();
  if (!reason) return null;

  const explicit = reason.match(/เหตุผล:\s*([^·]+)/);
  if (explicit) {
    const text = explicit[1].trim();
    return text || null;
  }

  // System-only notes — hide in the list (shown as chips instead).
  if (
    reason.startsWith('แจ้งไม่ครบ')
    || reason.startsWith('จาก ')
    || reason.startsWith('เปลี่ยนจาก')
    || reason.startsWith('ยกเลิกเพราะ')
  ) {
    return null;
  }

  return reason;
}
