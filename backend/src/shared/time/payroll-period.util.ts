// Payroll cycle anchor: 25th through 23rd of the following month (inclusive).
// Example: 2026-06-25 … 2026-07-23, pay date 2026-07-25.
// Work on the 24th falls in the next cycle (starts the 25th) — rare weekday edge.

export const PAYROLL_CYCLE_DAY = 25;
export const PAYROLL_CYCLE_END_DAY = 23;

export interface PayrollPeriodWindow {
  periodStart: string;
  periodEnd: string;
}

function isoFromYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseIsoParts(iso: string): { year: number; month: number; day: number } {
  const [year, month, day] = iso.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

function addMonths(year: number, month: number, delta: number): { year: number; month: number } {
  const total = year * 12 + (month - 1) + delta;
  return { year: Math.floor(total / 12), month: (total % 12) + 1 };
}

export function addDaysIso(iso: string, days: number): string {
  const cursor = new Date(`${iso}T00:00:00.000Z`);
  cursor.setUTCDate(cursor.getUTCDate() + days);
  return cursor.toISOString().slice(0, 10);
}

/**
 * Period start (25th) containing the given Bangkok work date.
 * Days 1–23 after the prior 25th belong to the period that started last month.
 * Days 24–31 belong to the period starting this month's 25th
 * (so the 24th — after cutoff 23 — rolls into the next pay cycle).
 */
export function payrollPeriodStartOf(workDateIso: string): string {
  const { year, month, day } = parseIsoParts(workDateIso);
  if (day > PAYROLL_CYCLE_END_DAY) {
    return isoFromYmd(year, month, PAYROLL_CYCLE_DAY);
  }
  const prev = addMonths(year, month, -1);
  return isoFromYmd(prev.year, prev.month, PAYROLL_CYCLE_DAY);
}

/** Inclusive period end (23rd) for a payroll period that starts on the 25th. */
export function payrollPeriodEndOf(periodStartIso: string): string {
  const { year, month } = parseIsoParts(periodStartIso);
  const next = addMonths(year, month, 1);
  return isoFromYmd(next.year, next.month, PAYROLL_CYCLE_END_DAY);
}

export function payrollPeriodWindowOf(workDateIso: string): PayrollPeriodWindow {
  const periodStart = payrollPeriodStartOf(workDateIso);
  return {
    periodStart,
    periodEnd: payrollPeriodEndOf(periodStart),
  };
}

export function nextPayrollPeriodStart(periodStartIso: string): string {
  return addDaysIso(payrollPeriodEndOf(periodStartIso), 1);
}

export function isDateInPayrollPeriod(dateIso: string, periodStartIso: string): boolean {
  const periodEnd = payrollPeriodEndOf(periodStartIso);
  return dateIso >= periodStartIso && dateIso <= periodEnd;
}

/**
 * Inclusive attendance / leave / off-day window for a stored cycle.
 * Standard cycles start on the 25th and end on the 23rd; the 24th (day after
 * cutoff) is attributed to the *next* cycle, so that cycle's window starts on the 24th.
 */
export function payrollAttendanceWindowOf(
  periodStartIso: string,
  periodEndIso: string,
): PayrollPeriodWindow {
  const startDay = Number(periodStartIso.slice(8, 10));
  const attendanceStart = startDay === PAYROLL_CYCLE_DAY
    ? addDaysIso(periodStartIso, -1)
    : periodStartIso;
  return { periodStart: attendanceStart, periodEnd: periodEndIso };
}

export function toUtcDateOnly(isoDate: string): Date {
  return new Date(`${isoDate.slice(0, 10)}T00:00:00.000Z`);
}

/** Current period plus the next period for advance monthly-off reporting. */
export function monthlyOffReportingWindow(asOfWorkDateIso: string): {
  validStart: string;
  validEnd: string;
  currentPeriod: PayrollPeriodWindow;
  nextPeriod: PayrollPeriodWindow;
} {
  const currentPeriod = payrollPeriodWindowOf(asOfWorkDateIso);
  const nextPeriod = payrollPeriodWindowOf(nextPayrollPeriodStart(currentPeriod.periodStart));
  return {
    validStart: currentPeriod.periodStart,
    validEnd: nextPeriod.periodEnd,
    currentPeriod,
    nextPeriod,
  };
}

export function formatPayrollPeriodRangeTh(periodStartIso: string, periodEndIso?: string): string {
  const end = periodEndIso ?? payrollPeriodEndOf(periodStartIso);
  const [, startMonth, startDay] = periodStartIso.split('-');
  const [, endMonth, endDay] = end.split('-');
  return `${startDay}/${startMonth} – ${endDay}/${endMonth}`;
}

export function groupDatesByPayrollPeriod(dates: string[]): Map<string, string[]> {
  const grouped = new Map<string, string[]>();
  for (const date of [...dates].sort()) {
    const periodStart = payrollPeriodStartOf(date);
    const bucket = grouped.get(periodStart) ?? [];
    bucket.push(date);
    grouped.set(periodStart, bucket);
  }
  return grouped;
}
