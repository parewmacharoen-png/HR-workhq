// ============================================================================
// modules/attendance/domain/services/employee-day-context.unit.spec.ts
// ============================================================================

import {
  datesIncludeSelectedDate,
  formatBangkokDateIso,
  resolveEmployeeDayContext,
} from './employee-day-context';

describe('employee-day-context', () => {
  describe('resolveEmployeeDayContext', () => {
    it('prioritises leave over monthly off', () => {
      expect(resolveEmployeeDayContext({
        hasApprovedLeave: true,
        hasApprovedMonthlyOff: true,
        isHoliday: false,
      })).toEqual({
        dayType: 'leave',
        skipAttendanceAlerts: true,
        skipAbsenceFlag: true,
      });
    });

    it('treats approved monthly off as non-workday', () => {
      expect(resolveEmployeeDayContext({
        hasApprovedLeave: false,
        hasApprovedMonthlyOff: true,
        isHoliday: false,
      })).toEqual({
        dayType: 'monthly_off',
        skipAttendanceAlerts: true,
        skipAbsenceFlag: true,
      });
    });

    it('weekends are workdays unless monthly off is approved', () => {
      expect(resolveEmployeeDayContext({
        hasApprovedLeave: false,
        hasApprovedMonthlyOff: false,
        isHoliday: false,
      })).toEqual({
        dayType: 'workday',
        skipAttendanceAlerts: false,
        skipAbsenceFlag: false,
      });
    });
  });

  describe('datesIncludeSelectedDate', () => {
    it('matches ISO date in array', () => {
      expect(datesIncludeSelectedDate(['2026-07-01', '2026-07-02'], '2026-07-01')).toBe(true);
    });

    it('returns false for non-array', () => {
      expect(datesIncludeSelectedDate('2026-07-01', '2026-07-01')).toBe(false);
    });
  });

  describe('formatBangkokDateIso', () => {
    it('formats date in Bangkok timezone', () => {
      expect(formatBangkokDateIso(new Date('2026-07-01T00:00:00+07:00'))).toBe('2026-07-01');
    });
  });
});
