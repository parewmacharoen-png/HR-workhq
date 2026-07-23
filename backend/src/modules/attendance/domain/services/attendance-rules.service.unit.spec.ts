// ============================================================================
// modules/attendance/domain/services/attendance-rules.service.unit.spec.ts
// ============================================================================

import {
  AttendanceRulesService,
  toAttendanceRuleParams,
  computeRoundedLateHours,
} from './attendance-rules.service';
import { DEFAULT_ATTENDANCE_RULES } from '../../../settings/domain/attendance-settings.types';

describe('AttendanceRulesService (settings-driven)', () => {
  const baseParams = () => toAttendanceRuleParams(DEFAULT_ATTENDANCE_RULES, 100);

  function atLocalTime(hours: number, minutes: number): Date {
    const d = new Date('2026-06-20T12:00:00.000Z');
    d.setHours(hours, minutes, 0, 0);
    return d;
  }

  it('applies grace period from settings', () => {
    const rules = new AttendanceRulesService({
      ...baseParams(),
      lateGraceMinutes: 15,
      shiftStartMinutes: 9 * 60,
    });
    const shiftStart = atLocalTime(9, 0);
    expect(rules.computeLate(atLocalTime(9, 14), shiftStart).lateMinutes).toBe(0);
    expect(rules.computeLate(atLocalTime(9, 16), shiftStart).lateMinutes).toBe(16);
  });

  it('uses hour-rounded late penalty multiplier from settings', () => {
    const rules = new AttendanceRulesService({
      ...baseParams(),
      lateGraceMinutes: 0,
      lateMultiplier: 2,
      shiftStartMinutes: 9 * 60,
      monthlyHourlyRate: 60,
    });
    const shiftStart = atLocalTime(9, 0);
    const result = rules.computeLate(atLocalTime(9, 30), shiftStart);
    expect(result.lateMinutes).toBe(30);
    expect(result.roundedLateHours).toBe(1);
    expect(result.lateDeduction).toBe(120);
  });

  it('subtracts break minutes from worked time', () => {
    const rules = new AttendanceRulesService({
      ...baseParams(),
      breakMinutes: 60,
    });
    expect(
      rules.computeWorkedMinutes(atLocalTime(9, 0), atLocalTime(17, 0)),
    ).toBe(7 * 60);
  });

  it('respects overtimeEnabled and minimumOvertimeMinutes', () => {
    const disabled = new AttendanceRulesService({
      ...baseParams(),
      overtimeEnabled: false,
    });
    expect(disabled.computeOvertime(atLocalTime(22, 30)).otHours).toBe(0);

    const enabled = new AttendanceRulesService({
      ...baseParams(),
      overtimeEnabled: true,
      minimumOvertimeMinutes: 60,
      shiftEndMinutes: 21 * 60,
      otStartDelayMinutes: 30,
      otHourlyRate: 50,
    });
    expect(enabled.computeOvertime(atLocalTime(22, 30)).otHours).toBe(1);
  });

  it('computeRoundedLateHours rounds up partial hours', () => {
    expect(computeRoundedLateHours(15)).toBe(1);
    expect(computeRoundedLateHours(60)).toBe(1);
    expect(computeRoundedLateHours(61)).toBe(2);
  });
});
