// ============================================================================
// modules/settings/domain/leave-settings.types.unit.spec.ts
// ============================================================================

import {
  DEFAULT_LEAVE_RULES,
  mergeLeaveRules,
  validateLeaveRules,
} from './leave-settings.types';
import { resolveEffectiveSettingValue } from './settings.types';

describe('leave-settings.types', () => {
  it('mergeLeaveRules uses defaults when value is missing', () => {
    expect(mergeLeaveRules(null).rescheduleNoticeDays).toBe(7);
    expect(mergeLeaveRules(null).newEmployeeEmergencyLeave.daysIfBelowThreshold).toBe(1);
  });

  it('mergeLeaveRules overlays company fields and nested objects', () => {
    const merged = mergeLeaveRules({
      rescheduleNoticeDays: 10,
      newEmployeeEmergencyLeave: { daysIfBelowThreshold: 2 },
    });
    expect(merged.rescheduleNoticeDays).toBe(10);
    expect(merged.newEmployeeEmergencyLeave.daysIfBelowThreshold).toBe(2);
    expect(merged.newEmployeeEmergencyLeave.remainingHalfYearAtLeastMonths).toBe(3);
  });

  it('resolveEffectiveSettingValue prefers company leave rules', () => {
    const company = { rescheduleNoticeDays: 5 };
    const system = { rescheduleNoticeDays: 7 };
    expect(resolveEffectiveSettingValue(company, system)).toEqual(company);
  });

  it('validateLeaveRules rejects invalid monthly off days', () => {
    const errors = validateLeaveRules({
      ...DEFAULT_LEAVE_RULES,
      monthlyOffDays: 1,
      minimumRecommendedOffDays: 2,
    });
    expect(errors).toContain('monthlyOffDays must be >= minimumRecommendedOffDays');
  });

  it('validateLeaveRules rejects negative notice days', () => {
    const errors = validateLeaveRules({
      ...DEFAULT_LEAVE_RULES,
      defaultLeaveNoticeDays: -1,
    });
    expect(errors.some((e) => e.includes('defaultLeaveNoticeDays'))).toBe(true);
  });
});
