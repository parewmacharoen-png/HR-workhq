import {
  filterHistoryByCategory,
  filterHistoryByMonth,
  formatAttendanceCategoryDetail,
  formatMonthlyAttendanceSummary,
  summarizeMonthHistory,
} from './telegram-attendance-summary.formatter';
import type { EmployeeAttendanceHistoryItemDto } from '../../attendance/application/dto/employee-attendance-view.dto';

const baseRow = (
  date: string,
  status: EmployeeAttendanceHistoryItemDto['status'],
  extra: Partial<EmployeeAttendanceHistoryItemDto> = {},
): EmployeeAttendanceHistoryItemDto => ({
  id: date,
  date,
  shift: 'day',
  checkInAt: null,
  checkOutAt: null,
  breakMinutes: 0,
  workedHours: 0,
  otHours: 0,
  lateMinutes: 0,
  status,
  workCategory: 'office',
  ...extra,
});

describe('telegram-attendance-summary.formatter', () => {
  const history: EmployeeAttendanceHistoryItemDto[] = [
    baseRow('2026-07-01', 'checked_out', {
      checkInAt: '2026-07-01T02:00:00.000Z',
      checkOutAt: '2026-07-01T12:00:00.000Z',
    }),
    baseRow('2026-07-02', 'late', { checkInAt: '2026-07-02T02:30:00.000Z', lateMinutes: 15 }),
    baseRow('2026-07-03', 'absent'),
    baseRow('2026-07-04', 'leave', { leaveTypeName: 'ลาป่วย', leaveTypeCode: 'sick' }),
    baseRow('2026-07-05', 'holiday'),
    baseRow('2026-06-28', 'checked_out'),
  ];

  it('filters and summarizes month history', () => {
    const july = filterHistoryByMonth(history, '2026-07');
    expect(july).toHaveLength(5);
    const stats = summarizeMonthHistory(july);
    expect(stats.workDays).toBe(2);
    expect(stats.lateDays).toBe(1);
    expect(stats.absentDays).toBe(1);
    expect(stats.leaveDays).toBe(1);
    expect(stats.holidayDays).toBe(1);
  });

  it('formats monthly summary in Thai', () => {
    const july = filterHistoryByMonth(history, '2026-07');
    const text = formatMonthlyAttendanceSummary('2026-07', summarizeMonthHistory(july));
    expect(text).toContain('สรุปเข้างาน');
    expect(text).toContain('มาทำงาน');
    expect(text).toContain('<b>2</b> วัน');
    expect(text).toContain('มาสาย');
  });

  it('formats category detail with dates', () => {
    const july = filterHistoryByMonth(history, '2026-07');
    const late = filterHistoryByCategory(july, 'late');
    const text = formatAttendanceCategoryDetail('late', '2026-07', late);
    expect(text).toContain('มาสาย');
    expect(text).toContain('02/07');
    expect(text).toContain('สาย 15 น.');
  });
});
