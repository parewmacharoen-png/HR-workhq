// ============================================================================
// modules/attendance/domain/services/shift-resolver.service.ts
// Resolves effective shift for a work date and builds Bangkok shift windows.
// ============================================================================

import { BANGKOK_TZ } from '../../../../shared/time/bangkok-time.provider';

export interface ShiftDefinition {
  id: string | null;
  name: string;
  startMinutes: number;
  endMinutes: number;
  crossesMidnight: boolean;
}

export interface ResolvedShiftWindow {
  shift: ShiftDefinition;
  shiftStartAt: Date;
  shiftEndAt: Date;
}

export interface ShiftAssignmentRow {
  shiftId: string;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  shift: {
    id: string;
    name: string;
    startMinutes: number;
    endMinutes: number;
    crossesMidnight: boolean;
  };
}

/** Pick the assignment effective on workDate (inclusive). */
export function resolveEffectiveAssignment(
  assignments: ShiftAssignmentRow[],
  workDate: Date,
): ShiftAssignmentRow | null {
  const day = workDate.toISOString().slice(0, 10);
  const sorted = [...assignments].sort(
    (a, b) => b.effectiveFrom.getTime() - a.effectiveFrom.getTime(),
  );
  for (const row of sorted) {
    const from = row.effectiveFrom.toISOString().slice(0, 10);
    const to = row.effectiveTo?.toISOString().slice(0, 10) ?? null;
    if (from <= day && (to === null || to >= day)) {
      return row;
    }
  }
  return null;
}

export function toShiftDefinition(
  shift: ShiftAssignmentRow['shift'] | ShiftDefinition,
): ShiftDefinition {
  return {
    id: shift.id,
    name: shift.name,
    startMinutes: shift.startMinutes,
    endMinutes: shift.endMinutes,
    crossesMidnight: shift.crossesMidnight,
  };
}

/** Build absolute shift start/end timestamps for a Bangkok work date. */
export function buildShiftWindow(
  workDate: Date,
  shift: ShiftDefinition,
): ResolvedShiftWindow {
  const day = workDate.toISOString().slice(0, 10);
  const shiftStartAt = bangkokTimestamp(day, shift.startMinutes);
  let endDay = day;
  if (shift.crossesMidnight || shift.endMinutes <= shift.startMinutes) {
    endDay = addDaysIso(day, 1);
  }
  const shiftEndAt = bangkokTimestamp(endDay, shift.endMinutes);
  return { shift, shiftStartAt, shiftEndAt };
}

/** Day shift from company attendance rules — default when no shift is assigned. */
export function defaultShiftFromRules(
  shiftStartMinutes: number,
  shiftEndMinutes: number,
): ShiftDefinition {
  return dayShiftFromRules(shiftStartMinutes, shiftEndMinutes);
}

export function dayShiftFromRules(
  shiftStartMinutes: number,
  shiftEndMinutes: number,
): ShiftDefinition {
  return {
    id: null,
    name: 'กะกลางวัน',
    startMinutes: shiftStartMinutes,
    endMinutes: shiftEndMinutes,
    crossesMidnight: shiftEndMinutes <= shiftStartMinutes,
  };
}

/** Only an explicit night profile counts as night; missing/other values default to day. */
export function isExplicitNightShift(
  defaultShift: 'day' | 'night' | string | null | undefined,
): boolean {
  return defaultShift === 'night';
}

/** Night shift uses company day-shift end → next-morning end (e.g. 21:00–09:00). */
export function nightShiftFromRules(
  dayShiftStartMinutes: number,
  dayShiftEndMinutes: number,
): ShiftDefinition {
  return {
    id: null,
    name: 'กะกลางคืน',
    startMinutes: dayShiftEndMinutes,
    endMinutes: dayShiftStartMinutes,
    crossesMidnight: true,
  };
}

/** Employees without a shift assignment use day shift unless profile explicitly says night. */
export function resolveShiftFallbackFromProfile(
  defaultShift: 'day' | 'night' | string | null | undefined,
  rules: { shiftStartMinutes: number; shiftEndMinutes: number },
): ShiftDefinition {
  if (isExplicitNightShift(defaultShift)) {
    return nightShiftFromRules(rules.shiftStartMinutes, rules.shiftEndMinutes);
  }
  return dayShiftFromRules(rules.shiftStartMinutes, rules.shiftEndMinutes);
}

function bangkokTimestamp(dateIso: string, minutesFromMidnight: number): Date {
  const hours = Math.floor(minutesFromMidnight / 60);
  const minutes = minutesFromMidnight % 60;
  const local = `${dateIso}T${pad(hours)}:${pad(minutes)}:00`;
  const utc = zonedTimeToUtc(local, BANGKOK_TZ);
  return utc;
}

function zonedTimeToUtc(localIsoNoZ: string, timeZone: string): Date {
  const probe = new Date(`${localIsoNoZ}Z`);
  const asBangkok = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(probe);
  const parts = Object.fromEntries(asBangkok.map((p) => [p.type, p.value]));
  const shown = `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}`;
  const shownMs = Date.parse(`${shown}Z`);
  const wantedMs = Date.parse(`${localIsoNoZ}Z`);
  const offsetMs = shownMs - wantedMs;
  return new Date(Date.parse(`${localIsoNoZ}Z`) - offsetMs);
}

function addDaysIso(dateIso: string, days: number): string {
  const d = new Date(`${dateIso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
