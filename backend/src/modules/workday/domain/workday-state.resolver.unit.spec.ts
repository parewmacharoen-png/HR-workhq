// ============================================================================
// modules/workday/domain/workday-state.resolver.unit.spec.ts
// ============================================================================

import {
  resolveWorkDayState,
  shouldFlagMissingCheckIn,
  shouldFlagMissingCheckOut,
} from './workday-state.resolver';

const base = {
  dateIso: '2026-06-29',
  todayIso: '2026-06-29',
  nowMinutes: 600,
  isHoliday: false,
  approvedLeave: false,
  pendingLeave: false,
  approvedMonthlyOff: false,
  pendingMonthlyOff: false,
  hasAbsence: false,
  attendance: null as null | {
    checkInAt: Date | null;
    checkOutAt: Date | null;
    breakStartAt: Date | null;
    breakEndAt: Date | null;
    needsRecalculation: boolean;
  },
  overtime: null as { status: 'pending' | 'approved' | 'rejected' } | null,
  shiftEndMinutes: 1080,
  graceMinutes: 15,
  breakMinutes: 60,
  missingCheckIn: false,
  missingCheckOut: false,
  breakTooLong: false,
};

describe('resolveWorkDayState', () => {
  it('returns LEAVE when approved leave', () => {
    expect(resolveWorkDayState({ ...base, approvedLeave: true })).toBe('LEAVE');
  });

  it('returns MONTHLY_OFF when approved monthly off', () => {
    expect(resolveWorkDayState({ ...base, approvedMonthlyOff: true })).toBe('MONTHLY_OFF');
  });

  it('returns HOLIDAY on holiday', () => {
    expect(resolveWorkDayState({ ...base, isHoliday: true })).toBe('HOLIDAY');
  });

  it('returns NEEDS_RECALCULATION when flagged', () => {
    expect(resolveWorkDayState({
      ...base,
      attendance: {
        checkInAt: new Date(),
        checkOutAt: null,
        breakStartAt: null,
        breakEndAt: null,
        needsRecalculation: true,
      },
    })).toBe('NEEDS_RECALCULATION');
  });

  it('returns WORKING with check-in only', () => {
    expect(resolveWorkDayState({
      ...base,
      attendance: {
        checkInAt: new Date(),
        checkOutAt: null,
        breakStartAt: null,
        breakEndAt: null,
        needsRecalculation: false,
      },
    })).toBe('WORKING');
  });

  it('returns BREAK during break', () => {
    expect(resolveWorkDayState({
      ...base,
      attendance: {
        checkInAt: new Date(),
        checkOutAt: null,
        breakStartAt: new Date(),
        breakEndAt: null,
        needsRecalculation: false,
      },
    })).toBe('BREAK');
  });

  it('returns FINISHED after checkout without pending OT', () => {
    expect(resolveWorkDayState({
      ...base,
      attendance: {
        checkInAt: new Date(),
        checkOutAt: new Date(),
        breakStartAt: null,
        breakEndAt: null,
        needsRecalculation: false,
      },
    })).toBe('FINISHED');
  });

  it('returns OT when checkout with pending OT', () => {
    expect(resolveWorkDayState({
      ...base,
      attendance: {
        checkInAt: new Date(),
        checkOutAt: new Date(),
        breakStartAt: null,
        breakEndAt: null,
        needsRecalculation: false,
      },
      overtime: { status: 'pending' },
    })).toBe('OT');
  });

  it('returns ABSENT when absence without check-in', () => {
    expect(resolveWorkDayState({
      ...base,
      hasAbsence: true,
      missingCheckIn: true,
    })).toBe('ABSENT');
  });

  it('returns MISSING_CHECK_IN when flagged', () => {
    expect(resolveWorkDayState({
      ...base,
      missingCheckIn: true,
    })).toBe('MISSING_CHECK_IN');
  });

  it('returns SCHEDULED by default', () => {
    expect(resolveWorkDayState({ ...base })).toBe('SCHEDULED');
  });
});

describe('shouldFlagMissingCheckIn', () => {
  it('flags after grace on same day', () => {
    expect(shouldFlagMissingCheckIn({
      dateIso: '2026-06-29',
      todayIso: '2026-06-29',
      nowMinutes: 9 * 60 + 20,
      shiftStartMinutes: 9 * 60,
      graceMinutes: 15,
      checkInAt: null,
      approvedLeave: false,
      approvedMonthlyOff: false,
      isHoliday: false,
    })).toBe(true);
  });
});

describe('shouldFlagMissingCheckOut', () => {
  it('flags when checked in past shift end', () => {
    expect(shouldFlagMissingCheckOut({
      dateIso: '2026-06-29',
      todayIso: '2026-06-29',
      nowMinutes: 19 * 60,
      shiftEndMinutes: 18 * 60,
      checkInAt: new Date(),
      checkOutAt: null,
      approvedLeave: false,
      approvedMonthlyOff: false,
      isHoliday: false,
    })).toBe(true);
  });
});
