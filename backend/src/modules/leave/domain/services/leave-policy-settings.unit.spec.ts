// ============================================================================
// modules/leave/domain/services/leave-policy-settings.unit.spec.ts
// ============================================================================

import { DEFAULT_LEAVE_RULES } from '../../../settings/domain/leave-settings.types';
import {
  toLeavePolicyConfig,
  validateRescheduleRequest,
  validateShiftSwapRequest,
} from './leave-reschedule-policy.service';

describe('leave policy (settings-driven)', () => {
  const baseReschedule = {
    originalStartDate: new Date('2026-07-10T00:00:00.000Z'),
    originalEndDate: new Date('2026-07-11T00:00:00.000Z'),
    originalDays: 2,
    newStartDate: new Date('2026-07-17T00:00:00.000Z'),
    newEndDate: new Date('2026-07-18T00:00:00.000Z'),
    newDays: 2,
    reason: 'Valid reason text',
    isEmergency: false,
    rescheduleCount: 0,
    submittedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('reads reschedule notice from settings', () => {
    const strict = toLeavePolicyConfig({
      ...DEFAULT_LEAVE_RULES,
      rescheduleNoticeDays: 14,
    });
    expect(() => validateRescheduleRequest(baseReschedule, strict)).toThrow('14 days');

    const relaxed = toLeavePolicyConfig({
      ...DEFAULT_LEAVE_RULES,
      rescheduleNoticeDays: 5,
    });
    expect(() => validateRescheduleRequest(baseReschedule, relaxed)).not.toThrow();
  });

  it('reads max reschedule count from settings', () => {
    const policy = toLeavePolicyConfig({
      ...DEFAULT_LEAVE_RULES,
      maxReschedulesPerRequest: 2,
    });
    expect(() => validateRescheduleRequest(
      { ...baseReschedule, rescheduleCount: 1 },
      policy,
    )).not.toThrow();
  });

  it('reads shift swap notice from settings', () => {
    const policy = toLeavePolicyConfig({
      ...DEFAULT_LEAVE_RULES,
      shiftSwapNoticeDays: 14,
    });
    expect(() => validateShiftSwapRequest({
      requesterLeave: {
        employeeId: 'a',
        companyId: 'co',
        startDate: new Date('2026-08-10T00:00:00.000Z'),
        endDate: new Date('2026-08-10T00:00:00.000Z'),
        days: 1,
        status: 'approved',
      },
      partnerLeave: {
        employeeId: 'b',
        companyId: 'co',
        startDate: new Date('2026-08-17T00:00:00.000Z'),
        endDate: new Date('2026-08-17T00:00:00.000Z'),
        days: 1,
        status: 'approved',
      },
      submittedAt: new Date('2026-08-01T00:00:00.000Z'),
    }, policy)).toThrow('14 days');
  });
});
