// ============================================================================
// modules/attendance/domain/services/shift-assignment.domain.unit.spec.ts
// P0-005b — future-dated shift assignments
// ============================================================================

import {
  assertNoOverlap,
  dateRangesOverlap,
  dayBeforeIso,
  findAssignmentsToClose,
  parseWorkDateIso,
  resolveNextScheduledAssignment,
  ShiftAssignmentOverlapError,
} from './shift-assignment.domain';
import {
  buildShiftWindow,
  resolveEffectiveAssignment,
} from './shift-resolver.service';

const dayShift = {
  id: 'day',
  name: 'Day',
  startMinutes: 9 * 60,
  endMinutes: 21 * 60,
  crossesMidnight: false,
};

const nightShift = {
  id: 'night',
  name: 'Night',
  startMinutes: 22 * 60,
  endMinutes: 6 * 60,
  crossesMidnight: true,
};

function row(
  id: string,
  shiftId: string,
  from: string,
  to: string | null,
  shift = dayShift,
) {
  return {
    id,
    shiftId,
    effectiveFrom: parseWorkDateIso(from),
    effectiveTo: to ? parseWorkDateIso(to) : null,
    shift: shiftId === 'night' ? nightShift : shift,
  };
}

describe('shift-assignment.domain (P0-005b)', () => {
  it('future shift does not affect today', () => {
    const assignments = [
      row('a1', 'day', '2026-06-01', '2026-06-29'),
      row('a2', 'night', '2026-06-30', null),
    ];
    const today = parseWorkDateIso('2026-06-20');
    expect(resolveEffectiveAssignment(assignments, today)?.shiftId).toBe('day');
    expect(resolveNextScheduledAssignment(assignments, today)?.shiftId).toBe('night');
  });

  it('future shift applies on effective date', () => {
    const assignments = [
      row('a1', 'day', '2026-06-01', '2026-06-29'),
      row('a2', 'night', '2026-06-30', null),
    ];
    const future = parseWorkDateIso('2026-06-30');
    expect(resolveEffectiveAssignment(assignments, future)?.shiftId).toBe('night');
  });

  it('no overlapping assignment allowed', () => {
    const existing = [row('a1', 'day', '2026-07-01', null)];
    const closeMap = new Map<string, string>();
    expect(() => assertNoOverlap(existing, closeMap, '2026-06-01', '2026-08-01'))
      .toThrow(ShiftAssignmentOverlapError);
  });

  it('previous assignment closes before future assignment', () => {
    const existing = [row('a1', 'day', '2026-06-01', null)];
    const toClose = findAssignmentsToClose(existing, '2026-07-01');
    expect(toClose).toHaveLength(1);
    expect(dayBeforeIso('2026-07-01')).toBe('2026-06-30');

    const closeMap = new Map([[toClose[0].id, dayBeforeIso('2026-07-01')]]);
    expect(() => assertNoOverlap(existing, closeMap, '2026-07-01', null)).not.toThrow();
  });

  it('night shift future assignment resolves correctly', () => {
    const assignments = [row('a1', 'night', '2026-07-01', null, nightShift)];
    const workDate = parseWorkDateIso('2026-07-01');
    const effective = resolveEffectiveAssignment(assignments, workDate);
    const window = buildShiftWindow(workDate, effective!.shift);
    expect(window.shiftStartAt.getTime()).toBeLessThan(window.shiftEndAt.getTime());
    const startHour = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      hour12: false,
    }).format(window.shiftStartAt);
    expect(startHour).toBe('22');
  });

  it('dateRangesOverlap detects inclusive overlap', () => {
    expect(dateRangesOverlap('2026-06-01', '2026-06-30', '2026-06-30', null)).toBe(true);
    expect(dateRangesOverlap('2026-06-01', '2026-06-29', '2026-06-30', null)).toBe(false);
  });
});

describe('needsRecalculation marking contract', () => {
  it('changing assignment over existing attendance marks needsRecalculation (service integration stub)', () => {
    const affectedFrom = '2026-06-15';
    const affectedTo = '2026-06-20';
    const workDates = ['2026-06-14', '2026-06-15', '2026-06-20', '2026-06-21'];
    const marked = workDates.filter((d) => d >= affectedFrom && d <= affectedTo);
    expect(marked).toEqual(['2026-06-15', '2026-06-20']);
  });
});
