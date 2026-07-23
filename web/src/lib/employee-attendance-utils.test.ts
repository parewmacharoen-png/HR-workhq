import { describe, expect, it } from 'vitest';
import {
  attendanceDayLabel,
  attendanceDayTitle,
  attendanceMonthOptions,
  attendanceShiftOptions,
  attendanceStatusLabel,
  attendanceStatusVariant,
  attendanceYearOptions,
  buildAttendanceDayChips,
  buildDayEventLines,
  filterAttendanceHistory,
  formatBreakListCell,
  formatBreakTotalDisplay,
  leaveTypeFullLabel,
  leaveTypeShortLabel,
  todayStatusLabel,
  todayStatusVariant,
} from './employee-attendance-utils';
import type { EmployeeAttendanceHistoryItem } from '../api/employee-attendance';

const base = (overrides: Partial<EmployeeAttendanceHistoryItem>): EmployeeAttendanceHistoryItem => ({
  id: 'att-1',
  date: '2026-06-10',
  shift: 'Day',
  checkInAt: '2026-06-10T01:00:00.000Z',
  checkOutAt: '2026-06-10T10:00:00.000Z',
  breakMinutes: 60,
  workedHours: 8,
  otHours: 1,
  lateMinutes: 0,
  status: 'checked_out',
  workCategory: 'office',
  ...overrides,
});

describe('employee attendance utils', () => {
  it('labels leave days by type', () => {
    expect(leaveTypeShortLabel('sick', 'Sick leave')).toBe('ลาป่วย');
    expect(leaveTypeShortLabel('emergency', null)).toBe('ฉุกเฉิน');
    expect(leaveTypeFullLabel('unpaid', null)).toBe('ลาไม่รับค่าจ้าง');
    expect(attendanceDayLabel('leave', { leaveTypeCode: 'sick', leaveTypeName: 'Sick', lateMinutes: 0 })).toBe('ลาป่วย');
    expect(attendanceDayLabel('leave', null)).toBe('ลา');
  });

  it('shows late and break overage as clear chips', () => {
    expect(attendanceDayLabel('late', { lateMinutes: 16 })).toBe('สาย 16 น.');
    const chips = buildAttendanceDayChips(
      base({
        status: 'late',
        lateMinutes: 16,
        breakMinutes: 67,
        breakAllowedMinutes: 60,
        breakOverageMinutes: 7,
        breakDeduction: 92,
        otHours: 0,
      }),
      'late',
      () => '09:16',
    );
    expect(chips.map((c) => c.text)).toEqual([
      'สาย 16 น.',
      'เข้า 09:16',
      'พักเกิน 7 น.',
    ]);
    expect(attendanceDayTitle(base({
      status: 'late',
      lateMinutes: 16,
      breakMinutes: 67,
      breakAllowedMinutes: 60,
      breakOverageMinutes: 7,
      breakDeduction: 92,
      otHours: 0,
    }))).toContain('พักเกิน 7 นาที (รวมพัก 67 นาที)');

    const lateAndBreak = base({
      status: 'late',
      lateMinutes: 16,
      checkInAt: '2026-07-04T02:16:00.000Z',
      breakMinutes: 67,
      breakAllowedMinutes: 60,
      breakOverageMinutes: 7,
      breakDeduction: 91.66,
      otHours: 0,
    });
    expect(formatBreakTotalDisplay(lateAndBreak)).toBe('67 นาที (สิทธิ์ 60 นาที)');
    expect(formatBreakListCell(lateAndBreak)).toBe('67 น. · เกิน 7 น.');
    expect(buildDayEventLines(lateAndBreak, () => '09:16')).toEqual([
      'เข้างานสาย 16 นาที (เข้า 09:16)',
      'พักรวม 67 นาที จากสิทธิ์ 60 นาที → พักเกิน 7 นาที → หัก ฿91.66',
    ]);
  });

  it('maps today and history status labels and colors', () => {
    expect(todayStatusLabel('working')).toBe('กำลังทำงาน');
    expect(todayStatusVariant('working')).toBe('success');
    expect(todayStatusVariant('checked_out')).toBe('info');
    expect(todayStatusVariant('absent')).toBe('danger');
    expect(attendanceStatusLabel('late')).toBe('มาสาย');
    expect(attendanceStatusVariant('late')).toBe('warning');
    expect(attendanceStatusVariant('leave')).toBe('info');
    expect(attendanceStatusVariant('holiday')).toBe('info');
    expect(attendanceStatusVariant('checked_out')).toBe('success');
  });

  it('filters by year, month, status, shift, and search', () => {
    const items = [
      base({ id: 'a' }),
      base({
        id: 'b',
        date: '2026-05-15',
        shift: 'Night',
        status: 'late',
        workCategory: 'wfh',
      }),
      base({
        id: 'c',
        date: '2025-12-01',
        status: 'absent',
        shift: 'Day',
      }),
    ];
    expect(filterAttendanceHistory(items, { year: '2026', month: '06', status: '', shift: '', search: '' })).toHaveLength(1);
    expect(filterAttendanceHistory(items, { year: '2026', month: '05', status: 'late', shift: 'Night', search: '' })).toHaveLength(1);
    expect(filterAttendanceHistory(items, { year: '2026', month: '06', status: '', shift: '', search: 'wfh' })).toHaveLength(0);
    expect(filterAttendanceHistory(items, { year: '2025', month: '12', status: 'absent', shift: '', search: '' })).toHaveLength(1);
  });

  it('builds year, month, and shift options', () => {
    const items = [
      base({ date: '2026-06-10', shift: 'Day' }),
      base({ id: 'att-2', date: '2026-05-03', shift: 'Night' }),
      base({ id: 'att-3', date: '2025-06-01', shift: 'Day' }),
    ];
    expect(attendanceYearOptions(items, 2026)).toEqual(['2026', '2025']);
    expect(attendanceMonthOptions(items, '2026')).toEqual(['06', '05']);
    expect(attendanceShiftOptions(items)).toEqual(['Day', 'Night']);
  });
});
