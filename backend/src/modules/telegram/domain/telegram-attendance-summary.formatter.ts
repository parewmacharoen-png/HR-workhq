// ============================================================================
// Telegram — employee monthly attendance summary (pure formatter).
// ============================================================================

import type {
  EmployeeAttendanceHistoryItemDto,
  EmployeeAttendanceHistoryStatus,
} from '../../attendance/application/dto/employee-attendance-view.dto';

export type AttendanceSummaryCategory = 'work' | 'late' | 'absent' | 'leave' | 'holiday';

export interface MonthAttendanceStats {
  workDays: number;
  lateDays: number;
  absentDays: number;
  leaveDays: number;
  holidayDays: number;
  otHours: number;
  breakOverDays: number;
}

const STATUS_LABELS: Record<EmployeeAttendanceHistoryStatus, string> = {
  working: 'ทำงาน',
  checked_out: 'เช็กเอาต์แล้ว',
  late: 'มาสาย',
  absent: 'ขาดงาน',
  leave: 'ลา',
  holiday: 'วันหยุด',
  incomplete: 'ไม่ครบ',
};

const CATEGORY_LABELS: Record<AttendanceSummaryCategory, string> = {
  work: 'มาทำงาน',
  late: 'มาสาย',
  absent: 'ขาดงาน',
  leave: 'ลา',
  holiday: 'วันหยุด',
};

function isWorkStatus(status: EmployeeAttendanceHistoryStatus): boolean {
  return status === 'working' || status === 'checked_out' || status === 'late';
}

export function filterHistoryByMonth(
  history: EmployeeAttendanceHistoryItemDto[],
  month: string,
): EmployeeAttendanceHistoryItemDto[] {
  return history
    .filter((row) => row.date.startsWith(`${month}-`))
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function summarizeMonthHistory(
  history: EmployeeAttendanceHistoryItemDto[],
): MonthAttendanceStats {
  return {
    workDays: history.filter((row) => isWorkStatus(row.status)).length,
    lateDays: history.filter(
      (row) => row.status === 'late' || row.lateMinutes > 0,
    ).length,
    absentDays: history.filter((row) => row.status === 'absent').length,
    leaveDays: history.filter((row) => row.status === 'leave').length,
    holidayDays: history.filter((row) => row.status === 'holiday').length,
    otHours: Math.round(history.reduce((sum, row) => sum + (row.otHours ?? 0), 0) * 100) / 100,
    breakOverDays: history.filter(
      (row) => (row.breakOverageMinutes ?? 0) > 0 || (row.breakDeduction ?? 0) > 0,
    ).length,
  };
}

export function filterHistoryByCategory(
  history: EmployeeAttendanceHistoryItemDto[],
  category: AttendanceSummaryCategory,
): EmployeeAttendanceHistoryItemDto[] {
  switch (category) {
    case 'work':
      return history.filter((row) => isWorkStatus(row.status));
    case 'late':
      return history.filter((row) => row.status === 'late' || row.lateMinutes > 0);
    case 'absent':
      return history.filter((row) => row.status === 'absent');
    case 'leave':
      return history.filter((row) => row.status === 'leave');
    case 'holiday':
      return history.filter((row) => row.status === 'holiday');
    default:
      return history;
  }
}

export function formatMonthLabelTh(month: string): string {
  const d = new Date(`${month}-15T12:00:00+07:00`);
  return new Intl.DateTimeFormat('th-TH', {
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Bangkok',
  }).format(d);
}

function formatDateShort(dateIso: string): string {
  const [, m, d] = dateIso.split('-');
  return `${d}/${m}`;
}

function formatTimeBangkok(iso: string | null): string {
  if (!iso) return '—';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(iso));
}

function formatDayLine(row: EmployeeAttendanceHistoryItemDto): string {
  const date = formatDateShort(row.date);
  switch (row.status) {
    case 'leave':
      return `• ${date} — ${row.leaveTypeName ?? 'ลา'}${row.leaveTypeCode ? ` (${row.leaveTypeCode})` : ''}`;
    case 'holiday':
      return `• ${date} — วันหยุด`;
    case 'absent':
      return `• ${date} — ขาดงาน`;
    case 'late':
    case 'working':
    case 'checked_out': {
      const inTime = row.checkInAt ? formatTimeBangkok(row.checkInAt) : '—';
      const outTime = row.checkOutAt ? formatTimeBangkok(row.checkOutAt) : '—';
      const late = row.lateMinutes > 0 ? ` สาย ${row.lateMinutes} น.` : '';
      const ot = row.otHours > 0 ? ` OT ${row.otHours} ชม.` : '';
      return `• ${date} — เข้า ${inTime} ออก ${outTime}${late}${ot}`;
    }
    default:
      return `• ${date} — ${STATUS_LABELS[row.status] ?? row.status}`;
  }
}

export function formatMonthlyAttendanceSummary(
  month: string,
  stats: MonthAttendanceStats,
): string {
  const label = formatMonthLabelTh(month);
  const lines = [
    `📊 <b>สรุปเข้างาน — ${label}</b>`,
    '',
    `✅ มาทำงาน: <b>${stats.workDays}</b> วัน`,
    `⚠️ มาสาย: <b>${stats.lateDays}</b> วัน`,
    `❌ ขาดงาน: <b>${stats.absentDays}</b> วัน`,
    `📝 ลา: <b>${stats.leaveDays}</b> วัน`,
    `🗓 วันหยุด: <b>${stats.holidayDays}</b> วัน`,
  ];
  if (stats.otHours > 0) {
    lines.push(`⏱ OT รวม: <b>${stats.otHours}</b> ชม.`);
  }
  if (stats.breakOverDays > 0) {
    lines.push(`☕ พักเกิน: <b>${stats.breakOverDays}</b> วัน`);
  }
  lines.push('', 'กดปุ่มด้านล่างเพื่อดูรายละเอียดแต่ละประเภท');
  return lines.join('\n');
}

export function formatAttendanceCategoryDetail(
  category: AttendanceSummaryCategory,
  month: string,
  items: EmployeeAttendanceHistoryItemDto[],
  maxItems = 25,
): string {
  const label = formatMonthLabelTh(month);
  const title = CATEGORY_LABELS[category];
  if (items.length === 0) {
    return `📋 <b>${title}</b> — ${label}\n\nไม่มีรายการในเดือนนี้`;
  }
  const shown = items.slice(0, maxItems);
  const lines = [
    `📋 <b>${title}</b> (${items.length} วัน)`,
    `<i>${label}</i>`,
    '',
    ...shown.map(formatDayLine),
  ];
  if (items.length > maxItems) {
    lines.push('', `… และอีก ${items.length - maxItems} วัน`);
  }
  return lines.join('\n');
}

export function shiftMonth(month: string, delta: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  const yy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${yy}-${mm}`;
}
