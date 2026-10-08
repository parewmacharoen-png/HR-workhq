/** Dates are typed and shown with the Thai Buddhist year (พ.ศ. = ค.ศ. + 543), matching the rest of the app. */
export const BUDDHIST_YEAR_OFFSET = 543;
export const THAI_DATE_EXAMPLE = '15/03/2540';
export const THAI_DATE_INPUT_HINT = `วัน/เดือน/ปี พ.ศ. (เช่น ${THAI_DATE_EXAMPLE})`;
export const THAI_DATE_PLACEHOLDER = `วว/ดด/ปปปป พ.ศ. เช่น ${THAI_DATE_EXAMPLE}`;

const MIN_CE_YEAR = 1900;
const MAX_YEARS_AHEAD = 10;

export type ThaiDateValidation = { ok: true; iso: string } | { ok: false; error: string };

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function toIso(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Checks a typed date. The year may be พ.ศ. (e.g. 2540) or ค.ศ. (e.g. 1997) — the ranges
 * do not overlap, so both are accepted and stored as an ISO (ค.ศ.) date.
 */
export function validateThaiDateInput(input: string, options: { maxIso?: string } = {}): ThaiDateValidation {
  const trimmed = input.trim();
  const formatError = `พิมพ์เป็น วว/ดด/ปปปป (ปี พ.ศ.) เช่น ${THAI_DATE_EXAMPLE}`;
  if (!trimmed) return { ok: false, error: formatError };

  let day: number;
  let month: number;
  let year: number;
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  const typed = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (iso) {
    [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else if (typed) {
    [day, month, year] = [Number(typed[1]), Number(typed[2]), Number(typed[3])];
    if (year >= MIN_CE_YEAR + BUDDHIST_YEAR_OFFSET) year -= BUDDHIST_YEAR_OFFSET;
  } else {
    return { ok: false, error: formatError };
  }

  const maxYear = new Date().getFullYear() + MAX_YEARS_AHEAD;
  if (year < MIN_CE_YEAR || year > maxYear) {
    return { ok: false, error: `ปีไม่ถูกต้อง — ใช้ปี พ.ศ. ${MIN_CE_YEAR + BUDDHIST_YEAR_OFFSET}–${maxYear + BUDDHIST_YEAR_OFFSET}` };
  }
  if (month < 1 || month > 12) return { ok: false, error: 'เดือนต้องอยู่ระหว่าง 01–12' };
  if (day < 1 || day > daysInMonth(year, month)) {
    return { ok: false, error: `ไม่มีวันที่ ${day} ในเดือนนี้` };
  }

  const result = toIso(year, month, day);
  if (options.maxIso && result > options.maxIso.slice(0, 10)) {
    return { ok: false, error: `วันที่ต้องไม่เกิน ${formatIsoDateAsDdMmYyyy(options.maxIso)}` };
  }
  return { ok: true, iso: result };
}

export function parseThaiDateInput(input: string): string | null {
  const result = validateThaiDateInput(input);
  return result.ok ? result.iso : null;
}

/** ISO date → dd/mm/yyyy with the พ.ศ. year. */
export function formatIsoDateAsDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10))) return iso;
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${Number(year) + BUDDHIST_YEAR_OFFSET}`;
}
