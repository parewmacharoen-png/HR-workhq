// ============================================================================
// modules/attendance/domain/services/shift-assignment.domain.ts
// Pure shift-assignment scheduling rules (overlap, close-before, next).
// ============================================================================

import { ShiftAssignmentRow } from './shift-resolver.service';

export function toDateIso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function parseWorkDateIso(dateIso: string): Date {
  return new Date(`${dateIso}T00:00:00.000Z`);
}

export function addDaysIso(dateIso: string, days: number): string {
  const d = parseWorkDateIso(dateIso);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateIso(d);
}

export function dayBeforeIso(dateIso: string): string {
  return addDaysIso(dateIso, -1);
}

/** True when [fromA, toA] and [fromB, toB] overlap (inclusive dates). */
export function dateRangesOverlap(
  fromA: string,
  toA: string | null,
  fromB: string,
  toB: string | null,
): boolean {
  const endA = toA ?? '9999-12-31';
  const endB = toB ?? '9999-12-31';
  return fromA <= endB && fromB <= endA;
}

export interface ShiftAssignmentWithId extends ShiftAssignmentRow {
  id: string;
}

/** Assignments that must close the day before newEffectiveFrom. */
export function findAssignmentsToClose(
  assignments: ShiftAssignmentWithId[],
  newEffectiveFrom: string,
): ShiftAssignmentWithId[] {
  return assignments.filter((row) => {
    const from = toDateIso(row.effectiveFrom);
    const to = row.effectiveTo ? toDateIso(row.effectiveTo) : null;
    return from < newEffectiveFrom && (to === null || to >= newEffectiveFrom);
  });
}

/** After applying close updates, assert the new range does not overlap. */
export function assertNoOverlap(
  assignments: ShiftAssignmentWithId[],
  closeBeforeId: Map<string, string>,
  newFrom: string,
  newTo: string | null,
): void {
  for (const row of assignments) {
    const from = toDateIso(row.effectiveFrom);
    const to = closeBeforeId.has(row.id)
      ? closeBeforeId.get(row.id)!
      : row.effectiveTo
        ? toDateIso(row.effectiveTo)
        : null;
    if (dateRangesOverlap(newFrom, newTo, from, to)) {
      throw new ShiftAssignmentOverlapError();
    }
  }
}

export function resolveNextScheduledAssignment(
  assignments: ShiftAssignmentRow[],
  workDate: Date,
): ShiftAssignmentRow | null {
  const day = toDateIso(workDate);
  const future = assignments
    .filter((row) => toDateIso(row.effectiveFrom) > day)
    .sort((a, b) => a.effectiveFrom.getTime() - b.effectiveFrom.getTime());
  return future[0] ?? null;
}

export class ShiftAssignmentOverlapError extends Error {
  constructor() {
    super('Shift assignment overlaps an existing assignment for this employee');
    this.name = 'ShiftAssignmentOverlapError';
  }
}

export class ShiftAssignmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ShiftAssignmentValidationError';
  }
}
