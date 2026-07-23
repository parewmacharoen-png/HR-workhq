// ============================================================================
// modules/employee/domain/services/employee-date-events.service.ts
// Pure date helpers for birthdays, tenure, and work anniversaries (EMP-006/007).
// ============================================================================

export const BANGKOK_TZ = 'Asia/Bangkok';

export const MILESTONE_ANNIVERSARY_YEARS = [1, 2, 3, 5, 10] as const;

export type MilestoneAnniversaryYear = (typeof MILESTONE_ANNIVERSARY_YEARS)[number];

export interface CalendarParts {
  year: number;
  month: number;
  day: number;
}

export function bangkokCalendarParts(d: Date): CalendarParts {
  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: BANGKOK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d);
  const [year, month, day] = formatted.split('-').map(Number) as [number, number, number];
  return { year, month, day };
}

export function formatDateDdMmYyyy(d: Date): string {
  const { day, month, year } = bangkokCalendarParts(d);
  return `${String(day).padStart(2, '0')}/${String(month).padStart(2, '0')}/${year}`;
}

import {
  formatIsoDateAsDdMmYyyy,
  parseThaiDateInput,
} from '../../../../shared/time/thai-date-input.util';

export { formatIsoDateAsDdMmYyyy } from '../../../../shared/time/thai-date-input.util';

/** @deprecated alias — use parseThaiDateInput from shared/time */
export const parseDateDdMmYyyyInput = parseThaiDateInput;

export function calculateAgeYears(dateOfBirth: Date, asOf: Date): number {
  const birth = bangkokCalendarParts(dateOfBirth);
  const ref = bangkokCalendarParts(asOf);
  let age = ref.year - birth.year;
  if (ref.month < birth.month || (ref.month === birth.month && ref.day < birth.day)) {
    age -= 1;
  }
  return Math.max(0, age);
}

export function calculateTenureParts(hireDate: Date, asOf: Date): { years: number; months: number } {
  const breakdown = calculateTenureBreakdown(hireDate, asOf);
  return { years: breakdown.years, months: breakdown.months };
}

export interface TenureBreakdown {
  years: number;
  months: number;
  days: number;
  totalDays: number;
}

export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

export function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  if ([4, 6, 9, 11].includes(month)) return 30;
  return 31;
}

function calendarPartsToUtcMs(parts: CalendarParts): number {
  return Date.UTC(parts.year, parts.month - 1, parts.day);
}

export function calculateTenureBreakdown(hireDate: Date, asOf: Date): TenureBreakdown {
  const hire = bangkokCalendarParts(hireDate);
  const ref = bangkokCalendarParts(asOf);
  const hireMs = calendarPartsToUtcMs(hire);
  const refMs = calendarPartsToUtcMs(ref);

  if (refMs < hireMs) {
    return { years: 0, months: 0, days: 0, totalDays: 0 };
  }

  let years = ref.year - hire.year;
  let months = ref.month - hire.month;
  let days = ref.day - hire.day;

  if (days < 0) {
    months -= 1;
    const prevMonth = ref.month === 1 ? 12 : ref.month - 1;
    const prevYear = ref.month === 1 ? ref.year - 1 : ref.year;
    days += daysInMonth(prevYear, prevMonth);
  }
  if (months < 0) {
    years -= 1;
    months += 12;
  }

  const totalDays = Math.round((refMs - hireMs) / (24 * 60 * 60 * 1000));

  return {
    years: Math.max(0, years),
    months: Math.max(0, months),
    days: Math.max(0, days),
    totalDays: Math.max(0, totalDays),
  };
}

/** Standard display: no days when tenure is 1+ years. */
export function formatTenureDisplay(breakdown: TenureBreakdown): string {
  const { years, months, days, totalDays } = breakdown;
  if (totalDays === 0) return '0 วัน';
  if (years === 0 && months === 0) return `${days} วัน`;
  if (years === 0) {
    if (days === 0) return `${months} เดือน`;
    return `${months} เดือน ${days} วัน`;
  }
  const parts: string[] = [`${years} ปี`];
  if (months > 0) parts.push(`${months} เดือน`);
  return parts.join(' ');
}

/** Profile display: includes day remainder even when 1+ years. */
export function formatTenureDisplayDetailed(breakdown: TenureBreakdown): string {
  const { years, months, days, totalDays } = breakdown;
  if (totalDays === 0) return '0 วัน';
  if (years === 0 && months === 0) return `${days} วัน`;
  if (years === 0) {
    if (days === 0) return `${months} เดือน`;
    return `${months} เดือน ${days} วัน`;
  }
  const parts: string[] = [`${years} ปี`];
  if (months > 0) parts.push(`${months} เดือน`);
  if (days > 0) parts.push(`${days} วัน`);
  return parts.join(' ');
}

export function formatTenureThai(years: number, months: number): string {
  return formatTenureDisplay({ years, months, days: 0, totalDays: 1 });
}

export function completeAnniversaryYears(hireDate: Date, asOf: Date): number {
  const hire = bangkokCalendarParts(hireDate);
  const ref = bangkokCalendarParts(asOf);
  let years = ref.year - hire.year;
  if (ref.month < hire.month || (ref.month === hire.month && ref.day < hire.day)) {
    years -= 1;
  }
  return Math.max(0, years);
}

export function isMilestoneAnniversaryYear(years: number): years is MilestoneAnniversaryYear {
  return (MILESTONE_ANNIVERSARY_YEARS as readonly number[]).includes(years);
}

export function isSameMonthDay(a: Date, ref: Date): boolean {
  const left = bangkokCalendarParts(a);
  const right = bangkokCalendarParts(ref);
  return left.month === right.month && left.day === right.day;
}

export function occursInMonth(date: Date, ref: Date): boolean {
  return bangkokCalendarParts(date).month === bangkokCalendarParts(ref).month;
}

/** Lower = sooner upcoming within the month; past days in month sort last. */
export function upcomingSortKey(eventDay: number, ref: CalendarParts): number {
  if (eventDay >= ref.day) return eventDay - ref.day;
  return 10_000 + eventDay;
}

export function milestoneLabelThai(years: number): string {
  return `ครบ ${years} ปี`;
}

export function nextMilestoneAnniversary(
  hireDate: Date,
  asOf: Date,
): { years: number; label: string } | null {
  const hire = bangkokCalendarParts(hireDate);
  const ref = bangkokCalendarParts(asOf);
  const yearsOnNextAnniversary = ref.month > hire.month
    || (ref.month === hire.month && ref.day >= hire.day)
    ? ref.year - hire.year + 1
    : ref.year - hire.year;
  if (yearsOnNextAnniversary <= 0) {
    return isMilestoneAnniversaryYear(1) ? { years: 1, label: milestoneLabelThai(1) } : null;
  }
  const milestone = MILESTONE_ANNIVERSARY_YEARS.find((m) => m >= yearsOnNextAnniversary);
  return milestone ? { years: milestone, label: milestoneLabelThai(milestone) } : null;
}

export type ProbationStatusCode = 'on_probation' | 'passed' | 'not_applicable';

export function resolveProbationStatus(
  employmentStatus: string,
): { code: ProbationStatusCode; label: string } {
  if (employmentStatus === 'probation') {
    return { code: 'on_probation', label: 'อยู่ระหว่างทดลองงาน' };
  }
  if (employmentStatus === 'active') {
    return { code: 'passed', label: 'ผ่านทดลองงานแล้ว' };
  }
  return { code: 'not_applicable', label: '—' };
}

export function daysUntilBangkok(target: Date, from: Date): number {
  const targetMs = calendarPartsToUtcMs(bangkokCalendarParts(target));
  const fromMs = calendarPartsToUtcMs(bangkokCalendarParts(from));
  return Math.round((targetMs - fromMs) / (24 * 60 * 60 * 1000));
}
