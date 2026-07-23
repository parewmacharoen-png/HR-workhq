// ============================================================================
// modules/attendance/domain/services/shift-resolver.service.unit.spec.ts
// ============================================================================

import {
  buildShiftWindow,
  resolveEffectiveAssignment,
  defaultShiftFromRules,
  nightShiftFromRules,
  resolveShiftFallbackFromProfile,
} from './shift-resolver.service';
import { AttendanceRulesService, toAttendanceRuleParams, computeRoundedLateHours } from './attendance-rules.service';
import { DEFAULT_ATTENDANCE_RULES } from '../../../settings/domain/attendance-settings.types';
import { isMonthlyOffLeaveType, isOffDayLeaveType, isSickLeaveType } from '../../../leave/domain/services/leave-type-classification';

describe('shift-resolver.service', () => {
  it('resolves effective assignment by work date', () => {
    const assignments = [
      {
        shiftId: 's1',
        effectiveFrom: new Date('2026-06-01T00:00:00.000Z'),
        effectiveTo: new Date('2026-06-15T00:00:00.000Z'),
        shift: { id: 's1', name: 'A', startMinutes: 540, endMinutes: 1260, crossesMidnight: false },
      },
      {
        shiftId: 's2',
        effectiveFrom: new Date('2026-06-16T00:00:00.000Z'),
        effectiveTo: null,
        shift: { id: 's2', name: 'B', startMinutes: 1260, endMinutes: 540, crossesMidnight: true },
      },
    ];
    expect(resolveEffectiveAssignment(assignments, new Date('2026-06-10T00:00:00.000Z'))?.shiftId).toBe('s1');
    expect(resolveEffectiveAssignment(assignments, new Date('2026-06-20T00:00:00.000Z'))?.shiftId).toBe('s2');
  });

  it('builds night shift window crossing midnight', () => {
    const shift = nightShiftFromRules(9 * 60, 21 * 60);
    expect(shift.name).toBe('กะกลางคืน');
    expect(shift.startMinutes).toBe(21 * 60);
    expect(shift.endMinutes).toBe(9 * 60);
    const window = buildShiftWindow(new Date('2026-06-20T00:00:00.000Z'), shift);
    expect(window.shiftStartAt.getTime()).toBeLessThan(window.shiftEndAt.getTime());
    const startHour = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      hour12: false,
    }).format(window.shiftStartAt);
    expect(startHour).toBe('21');
  });

  it('uses night profile fallback instead of default day shift', () => {
    const night = resolveShiftFallbackFromProfile('night', DEFAULT_ATTENDANCE_RULES);
    expect(night.name).toBe('กะกลางคืน');
    expect(night.startMinutes).toBe(21 * 60);
    const day = resolveShiftFallbackFromProfile('day', DEFAULT_ATTENDANCE_RULES);
    expect(day.name).toBe('กะกลางวัน');
    expect(day.startMinutes).toBe(9 * 60);
  });

  it('defaults to day shift when profile shift is not set', () => {
    expect(resolveShiftFallbackFromProfile(null, DEFAULT_ATTENDANCE_RULES).name).toBe('กะกลางวัน');
    expect(resolveShiftFallbackFromProfile(undefined, DEFAULT_ATTENDANCE_RULES).name).toBe('กะกลางวัน');
  });
});

describe('P0-005 attendance rules', () => {
  const baseParams = () => toAttendanceRuleParams(DEFAULT_ATTENDANCE_RULES, 100);

  function atLocalTime(hours: number, minutes: number): Date {
    const d = new Date('2026-06-20T12:00:00.000Z');
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  it('applies 15-minute grace period', () => {
    const rules = new AttendanceRulesService(baseParams());
    const shiftStart = atLocalTime(9, 0);
    expect(rules.computeLate(atLocalTime(9, 14), shiftStart).lateMinutes).toBe(0);
    expect(rules.computeLate(atLocalTime(9, 16), shiftStart).lateMinutes).toBe(16);
  });

  it('rounds late hours up for deduction', () => {
    const rules = new AttendanceRulesService({
      ...baseParams(),
      lateGraceMinutes: 0,
      lateMultiplier: 2,
      monthlyHourlyRate: 60,
    });
    const shiftStart = atLocalTime(9, 0);
    const result = rules.computeLate(atLocalTime(9, 30), shiftStart);
    expect(result.roundedLateHours).toBe(1);
    expect(result.lateDeduction).toBe(120);
    const result61 = rules.computeLate(atLocalTime(10, 1), shiftStart);
    expect(result61.roundedLateHours).toBe(2);
    expect(result61.lateDeduction).toBe(240);
  });

  it('check-out with no OT leaves overtime null at service contract level', () => {
    const rules = new AttendanceRulesService(baseParams());
    const checkIn = atLocalTime(9, 0);
    const checkOut = atLocalTime(18, 0);
    expect(rules.computeWorkedMinutes(checkIn, checkOut)).toBeGreaterThan(0);
    expect(rules.computeOvertimeFromEnd(checkOut, checkOut).otHours).toBe(0);
  });

  it('pending OT uses computeOvertimeFromEnd with minimum minutes', () => {
    const rules = new AttendanceRulesService({
      ...baseParams(),
      minimumOvertimeMinutes: 60,
      otHourlyRate: 50,
    });
    const start = atLocalTime(21, 0);
    const end = atLocalTime(22, 30);
    const ot = rules.computeOvertimeFromEnd(start, end);
    expect(ot.otHours).toBe(2);
    expect(ot.amount).toBe(100);
  });
});

describe('monthly off vs leave classification', () => {
  it('monthly off is not treated as leave off-day', () => {
    expect(isMonthlyOffLeaveType('monthly_off')).toBe(true);
    expect(isOffDayLeaveType('monthly_off')).toBe(false);
    expect(isOffDayLeaveType('sick')).toBe(false);
    expect(isSickLeaveType('sick')).toBe(true);
  });
});

describe('computeRoundedLateHours', () => {
  it('rounds partial hours up', () => {
    expect(computeRoundedLateHours(1)).toBe(1);
    expect(computeRoundedLateHours(60)).toBe(1);
    expect(computeRoundedLateHours(61)).toBe(2);
  });
});
