import type { EmployeeAttendanceHistoryItem } from '../api/employee-attendance';

export const TODAY_STATUS_LABELS: Record<string, string> = {
  not_checked_in: 'ยังไม่เช็กอิน',
  working: 'กำลังทำงาน',
  checked_out: 'เช็กเอาต์แล้ว',
  absent: 'ขาดงาน',
  leave: 'ลา',
  holiday: 'วันหยุด',
};

export const ATTENDANCE_STATUS_LABELS: Record<string, string> = {
  working: 'กำลังทำงาน',
  checked_out: 'เช็กเอาต์แล้ว',
  late: 'มาสาย',
  absent: 'ขาดงาน',
  leave: 'ลา',
  holiday: 'วันหยุด',
  incomplete: 'ไม่ครบ',
};

export function todayStatusLabel(status: string): string {
  return TODAY_STATUS_LABELS[status] ?? status;
}

export function attendanceStatusLabel(status: string): string {
  return ATTENDANCE_STATUS_LABELS[status] ?? status;
}

export function todayStatusVariant(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'working': return 'success';
    case 'checked_out': return 'info';
    case 'not_checked_in': return 'warning';
    case 'absent': return 'danger';
    case 'leave': return 'info';
    case 'holiday': return 'info';
    default: return 'neutral';
  }
}

export function attendanceStatusVariant(status: string): 'success' | 'info' | 'warning' | 'danger' | 'neutral' {
  switch (status) {
    case 'working': return 'success';
    case 'checked_out': return 'success';
    case 'late': return 'warning';
    case 'absent': return 'danger';
    case 'leave': return 'info';
    case 'holiday': return 'info';
    default: return 'neutral';
  }
}

export function isOffDayStatus(status: string): boolean {
  return status === 'holiday' || status === 'leave';
}

export function isWorkDayStatus(status: string): boolean {
  return status === 'working' || status === 'checked_out' || status === 'late';
}

/** Short label for calendar cells (leave type when known). */
export function attendanceDayLabel(
  status: string,
  item?: Pick<EmployeeAttendanceHistoryItem, 'leaveTypeCode' | 'leaveTypeName' | 'lateMinutes'> | null,
): string {
  if (status === 'none' || status === 'empty') return '';
  if (status === 'holiday') return 'วันหยุด';
  if (status === 'leave') return leaveTypeShortLabel(item?.leaveTypeCode, item?.leaveTypeName);
  if (status === 'absent') return 'ขาดงาน';
  if (status === 'late') {
    const mins = item?.lateMinutes ?? 0;
    return mins > 0 ? `สาย ${mins} น.` : 'มาสาย';
  }
  if (status === 'working' || status === 'checked_out') return 'ทำงาน';
  return attendanceStatusLabel(status);
}

export type AttendanceDayChipTone = 'status' | 'time' | 'late' | 'break' | 'ot' | 'ot-invalid';

export interface AttendanceDayChip {
  tone: AttendanceDayChipTone;
  text: string;
}

/** Compact chips for calendar cells — easy to scan. */
export function buildAttendanceDayChips(
  item: EmployeeAttendanceHistoryItem | null | undefined,
  status: string,
  formatTime: (iso: string | null) => string,
): AttendanceDayChip[] {
  if (!item || status === 'none' || status === 'empty') return [];

  const chips: AttendanceDayChip[] = [
    { tone: 'status', text: attendanceDayLabel(status, item) },
  ];

  if (item.checkInAt && (status === 'late' || status === 'working' || status === 'checked_out')) {
    chips.push({ tone: 'time', text: `เข้า ${formatTime(item.checkInAt)}` });
  }

  if (status === 'late' && item.lateMinutes > 0) {
    // Already in status chip as "สาย X น." — skip duplicate.
  } else if (item.lateMinutes > 0 && status !== 'late') {
    chips.push({ tone: 'late', text: `สาย ${item.lateMinutes} น.` });
  }

  if (hasBreakOverage(item)) {
    chips.push({ tone: 'break', text: `พักเกิน ${breakOverageMinutesOf(item)} น.` });
  }

  if (item.otHours > 0) {
    chips.push({
      tone: item.otValid === false ? 'ot-invalid' : 'ot',
      text: item.otValid === false ? `OT ${item.otHours} ชม. !` : `OT ${item.otHours} ชม.`,
    });
  }

  return chips;
}

/** Minutes over the allowed break (never negative). */
export function breakOverageMinutesOf(
  item: Pick<EmployeeAttendanceHistoryItem, 'breakMinutes' | 'breakAllowedMinutes' | 'breakOverageMinutes'>,
): number {
  if (item.breakOverageMinutes != null) return Math.max(0, item.breakOverageMinutes);
  return Math.max(0, item.breakMinutes - (item.breakAllowedMinutes ?? 0));
}

export function hasBreakOverage(
  item: Pick<
    EmployeeAttendanceHistoryItem,
    'breakMinutes' | 'breakAllowedMinutes' | 'breakOverageMinutes' | 'breakDeduction'
  >,
): boolean {
  return (item.breakDeduction ?? 0) > 0 || breakOverageMinutesOf(item) > 0;
}

/** e.g. "67 นาที (สิทธิ์ 60 นาที)" — total break, not the penalty minutes. */
export function formatBreakTotalDisplay(
  item: Pick<EmployeeAttendanceHistoryItem, 'breakMinutes' | 'breakAllowedMinutes'>,
): string {
  if (item.breakMinutes <= 0) return '—';
  const allowed = item.breakAllowedMinutes;
  if (allowed != null && allowed > 0) {
    return `${item.breakMinutes} นาที (สิทธิ์ ${allowed} นาที)`;
  }
  return `${item.breakMinutes} นาที`;
}

/** Compact list cell: "67 น. · เกิน 7 น." */
export function formatBreakListCell(
  item: Pick<
    EmployeeAttendanceHistoryItem,
    'breakMinutes' | 'breakAllowedMinutes' | 'breakOverageMinutes' | 'breakDeduction'
  >,
): string {
  if (item.breakMinutes <= 0) return '—';
  const over = breakOverageMinutesOf(item);
  if (over > 0 || (item.breakDeduction ?? 0) > 0) {
    return `${item.breakMinutes} น. · เกิน ${over} น.`;
  }
  return `${item.breakMinutes} น.`;
}

function formatBaht(amount: number): string {
  return `฿${amount.toLocaleString('th-TH', { maximumFractionDigits: 2 })}`;
}

/**
 * Plain-language bullets for what happened that day
 * (late vs break overage are separate events).
 */
export function buildDayEventLines(
  item: EmployeeAttendanceHistoryItem,
  formatTime: (iso: string | null) => string,
): string[] {
  const lines: string[] = [];

  if (item.lateMinutes > 0) {
    const time = item.checkInAt ? ` (เข้า ${formatTime(item.checkInAt)})` : '';
    lines.push(`เข้างานสาย ${item.lateMinutes} นาที${time}`);
  }

  if (hasBreakOverage(item)) {
    const allowed = item.breakAllowedMinutes ?? 0;
    const over = breakOverageMinutesOf(item);
    const deduct = (item.breakDeduction ?? 0) > 0
      ? ` → หัก ${formatBaht(item.breakDeduction!)}`
      : '';
    lines.push(
      `พักรวม ${item.breakMinutes} นาที จากสิทธิ์ ${allowed} นาที → พักเกิน ${over} นาที${deduct}`,
    );
  } else if (item.breakMinutes > 0) {
    const allowed = item.breakAllowedMinutes;
    lines.push(
      allowed != null && allowed > 0
        ? `พักรวม ${item.breakMinutes} นาที (ไม่เกินสิทธิ์ ${allowed} นาที)`
        : `พักรวม ${item.breakMinutes} นาที`,
    );
  }

  if (item.otHours > 0) {
    lines.push(
      item.otValid === false
        ? `OT ${item.otHours} ชม. (ไม่ถูกต้อง — ไม่มีเช็กอิน)`
        : `OT ${item.otHours} ชม.`,
    );
  }

  return lines;
}

/** Tooltip / title text for a calendar day. */
export function attendanceDayTitle(item: EmployeeAttendanceHistoryItem | null | undefined): string {
  if (!item) return '';
  const parts: string[] = [attendanceDayLabel(item.status, item)];
  if (item.lateMinutes > 0) parts.push(`สาย ${item.lateMinutes} นาที`);
  if (hasBreakOverage(item)) {
    const over = breakOverageMinutesOf(item);
    parts.push(`พักเกิน ${over} นาที (รวมพัก ${item.breakMinutes} นาที)`);
    if ((item.breakDeduction ?? 0) > 0) {
      parts.push(`หักพัก ${formatBaht(item.breakDeduction!)}`);
    }
  }
  if (item.otHours > 0) parts.push(`OT ${item.otHours} ชม.`);
  return parts.join(' · ');
}

export function leaveTypeShortLabel(
  code?: string | null,
  name?: string | null,
): string {
  switch (code) {
    case 'sick':
      return 'ลาป่วย';
    case 'emergency':
      return 'ฉุกเฉิน';
    case 'unpaid':
      return 'ไม่รับค่าจ้าง';
    case 'annual':
      return 'พักร้อน';
    default:
      if (name?.trim()) {
        const trimmed = name.trim();
        return trimmed.length > 10 ? `${trimmed.slice(0, 10)}…` : trimmed;
      }
      return 'ลา';
  }
}

export function leaveTypeFullLabel(
  code?: string | null,
  name?: string | null,
): string {
  switch (code) {
    case 'sick':
      return 'ลาป่วย';
    case 'emergency':
      return 'ลากรณีฉุกเฉิน';
    case 'unpaid':
      return 'ลาไม่รับค่าจ้าง';
    case 'annual':
      return 'ลาพักร้อน';
    default:
      return name?.trim() || 'ลา';
  }
}

export interface AttendanceCalendarDay {
  date: string;
  day: number;
  weekday: number;
  status: string;
  item: EmployeeAttendanceHistoryItem | null;
}

/** Build a full month grid (Sun–Sat) for the selected year/month. */
export function buildAttendanceMonthCalendar(
  year: string,
  month: string,
  history: EmployeeAttendanceHistoryItem[],
): AttendanceCalendarDay[] {
  if (!/^\d{4}$/.test(year) || !/^\d{2}$/.test(month)) return [];
  const y = Number(year);
  const m = Number(month);
  const daysInMonth = new Date(y, m, 0).getDate();
  const byDate = new Map(history.map((row) => [row.date, row]));
  const firstWeekday = new Date(y, m - 1, 1).getDay();
  const cells: AttendanceCalendarDay[] = [];

  for (let i = 0; i < firstWeekday; i += 1) {
    cells.push({ date: '', day: 0, weekday: i, status: 'empty', item: null });
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${month}-${String(day).padStart(2, '0')}`;
    const item = byDate.get(date) ?? null;
    cells.push({
      date,
      day,
      weekday: (firstWeekday + day - 1) % 7,
      status: item?.status ?? 'none',
      item,
    });
  }
  return cells;
}

export function filterAttendanceHistory(
  items: EmployeeAttendanceHistoryItem[],
  filters: {
    month: string;
    year: string;
    status: string;
    shift: string;
    search: string;
  },
): EmployeeAttendanceHistoryItem[] {
  const query = filters.search.trim().toLowerCase();
  return items.filter((item) => {
    if (filters.year && !item.date.startsWith(`${filters.year}-`)) return false;
    if (filters.month && !item.date.startsWith(`${filters.year}-${filters.month.padStart(2, '0')}-`)) return false;
    if (filters.status && item.status !== filters.status) return false;
    if (filters.shift && item.shift !== filters.shift) return false;
    if (!query) return true;
    const haystack = [
      item.date,
      item.shift ?? '',
      item.status,
      item.workCategory,
    ].join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

export function attendanceYearOptions(items: EmployeeAttendanceHistoryItem[], fallbackYear: number): string[] {
  const years = new Set(items.map((item) => item.date.slice(0, 4)));
  years.add(String(fallbackYear));
  return [...years].sort((a, b) => Number(b) - Number(a));
}

export function attendanceMonthOptions(items: EmployeeAttendanceHistoryItem[], year: string): string[] {
  const months = new Set(
    items
      .filter((item) => item.date.startsWith(`${year}-`))
      .map((item) => item.date.slice(5, 7)),
  );
  if (!months.size) months.add(String(new Date().getMonth() + 1).padStart(2, '0'));
  return [...months].sort((a, b) => Number(b) - Number(a));
}

export function attendanceShiftOptions(items: EmployeeAttendanceHistoryItem[]): string[] {
  const shifts = new Set(items.map((item) => item.shift).filter(Boolean) as string[]);
  return [...shifts].sort();
}

export function formatAttendanceTime(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleTimeString('th-TH', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone: 'Asia/Bangkok',
  });
}

export function formatWorkedHours(hours: number): string {
  return `${hours.toFixed(2)} ชม.`;
}
