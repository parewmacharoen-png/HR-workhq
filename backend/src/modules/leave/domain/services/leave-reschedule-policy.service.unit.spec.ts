// ============================================================================
// modules/leave/domain/services/leave-reschedule-policy.service.unit.spec.ts
// ============================================================================

import {
  computeEndDateFromStart,
  computeInclusiveLeaveDays,
  MIN_RESCHEDULE_REASON_LENGTH,
  RESCHEDULE_NOTICE_DAYS,
  validateRescheduleRequest,
  validateShiftSwapRequest,
} from './leave-reschedule-policy.service';
import { ValidationError } from '../../../../shared/kernel/domain-error';

describe('leave-reschedule-policy', () => {
  const originalStart = new Date('2026-07-10T00:00:00.000Z');
  const originalEnd = new Date('2026-07-11T00:00:00.000Z');
  const originalDays = 2;

  const baseInput = {
    originalStartDate: originalStart,
    originalEndDate: originalEnd,
    originalDays,
    newStartDate: new Date('2026-07-17T00:00:00.000Z'),
    newEndDate: new Date('2026-07-18T00:00:00.000Z'),
    newDays: 2,
    reason: 'Project deadline moved',
    isEmergency: false,
    rescheduleCount: 0,
    submittedAt: new Date('2026-07-01T00:00:00.000Z'),
  };

  it('computes inclusive leave days', () => {
    expect(computeInclusiveLeaveDays('2026-07-10', '2026-07-11')).toBe(2);
    expect(computeInclusiveLeaveDays('2026-07-10', '2026-07-10')).toBe(1);
  });

  it('computes end date from start and duration', () => {
    expect(computeEndDateFromStart('2026-07-17', 2).toISOString().slice(0, 10)).toBe('2026-07-18');
  });

  it('accepts a valid reschedule request', () => {
    expect(() => validateRescheduleRequest(baseInput)).not.toThrow();
  });

  it(`rejects reasons shorter than ${MIN_RESCHEDULE_REASON_LENGTH} characters`, () => {
    expect(() => validateRescheduleRequest({ ...baseInput, reason: 'too short' }))
      .toThrow(ValidationError);
  });

  it('rejects when rescheduleCount is already 1', () => {
    expect(() => validateRescheduleRequest({ ...baseInput, rescheduleCount: 1 }))
      .toThrow('already been rescheduled');
  });

  it('rejects duration changes', () => {
    expect(() => validateRescheduleRequest({ ...baseInput, newDays: 1 }))
      .toThrow('same leave duration');
  });

  it('rejects moving leave to the same or earlier date', () => {
    expect(() => validateRescheduleRequest({
      ...baseInput,
      newStartDate: originalStart,
      newEndDate: originalEnd,
    })).toThrow('later than the original');
  });

  it(`requires ${RESCHEDULE_NOTICE_DAYS}-day notice unless emergency`, () => {
    expect(() => validateRescheduleRequest({
      ...baseInput,
      submittedAt: new Date('2026-07-08T00:00:00.000Z'),
    })).toThrow(`${RESCHEDULE_NOTICE_DAYS} days`);
    expect(() => validateRescheduleRequest({
      ...baseInput,
      submittedAt: new Date('2026-07-08T00:00:00.000Z'),
      isEmergency: true,
    })).not.toThrow();
  });

  describe('shift swap', () => {
    const leave = (employeeId: string, start: string, end: string, days: number) => ({
      employeeId,
      companyId: 'co-1',
      startDate: new Date(`${start}T00:00:00.000Z`),
      endDate: new Date(`${end}T00:00:00.000Z`),
      days,
      status: 'approved' as const,
    });

    it('accepts a valid swap between two employees', () => {
      expect(() => validateShiftSwapRequest({
        requesterLeave: leave('emp-a', '2026-08-10', '2026-08-10', 1),
        partnerLeave: leave('emp-b', '2026-08-17', '2026-08-17', 1),
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
      })).not.toThrow();
    });

    it('rejects swaps with different durations', () => {
      expect(() => validateShiftSwapRequest({
        requesterLeave: leave('emp-a', '2026-08-10', '2026-08-11', 2),
        partnerLeave: leave('emp-b', '2026-08-17', '2026-08-17', 1),
        submittedAt: new Date('2026-08-01T00:00:00.000Z'),
      })).toThrow('same duration');
    });
  });
});
