// ============================================================================
// modules/settings/domain/attendance-settings.types.unit.spec.ts
// ============================================================================

import {
  DEFAULT_ATTENDANCE_RULES,
  mergeAttendanceRules,
  validateAttendanceRules,
} from './attendance-settings.types';
import { resolveEffectiveSettingValue } from './settings.types';

describe('attendance-settings.types', () => {
  it('mergeAttendanceRules uses defaults when value is missing', () => {
    expect(mergeAttendanceRules(null)).toEqual(DEFAULT_ATTENDANCE_RULES);
  });

  it('mergeAttendanceRules overlays company fields', () => {
    const merged = mergeAttendanceRules({ graceMinutes: 20, breakMinutes: 45 });
    expect(merged.graceMinutes).toBe(20);
    expect(merged.breakMinutes).toBe(45);
    expect(merged.latePenaltyMultiplier).toBe(DEFAULT_ATTENDANCE_RULES.latePenaltyMultiplier);
  });

  it('resolveEffectiveSettingValue prefers company attendance rules', () => {
    const company = { graceMinutes: 10 };
    const system = { graceMinutes: 15 };
    const resolved = resolveEffectiveSettingValue(company, system);
    expect(resolved).toEqual(company);
  });

  it('validateAttendanceRules rejects invalid thresholds', () => {
    const errors = validateAttendanceRules({
      ...DEFAULT_ATTENDANCE_RULES,
      breakMinutes: 0,
      halfDayAbsenceThresholdHours: 8,
      fullDayAbsenceThresholdHours: 4,
    });
    expect(errors).toContain('breakMinutes must be greater than 0');
    expect(errors).toContain('halfDayAbsenceThresholdHours must not exceed fullDayAbsenceThresholdHours');
  });
});
