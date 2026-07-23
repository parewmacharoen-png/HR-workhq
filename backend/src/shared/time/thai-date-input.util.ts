// Shared Thai date input: DD/MM/YYYY for users, ISO YYYY-MM-DD internally.

export const THAI_DATE_INPUT_HINT = 'วัน/เดือน/ปี (เช่น 05/06/2026)';
export const THAI_MULTI_DATE_INPUT_HINT =
  'วัน/เดือน/ปี — หลายวันคั่นด้วยจุลภาค หรือช่วง เช่น 16/07/2026,19/07/2026,22-23/07/2026';
export const THAI_DATE_INPUT_ERROR = '❌ รูปแบบวันที่ไม่ถูกต้อง กรุณากรอก วัน/เดือน/ปี (เช่น 05/06/2026)';
export const THAI_DATE_VALIDATION_ERROR = 'ต้องเป็นรูปแบบ วัน/เดือน/ปี (เช่น 05/06/2026)';
export const THAI_MULTI_DATE_VALIDATION_ERROR =
  'ต้องเป็นรูปแบบ วัน/เดือน/ปี — หลายวันคั่นด้วยจุลภาค หรือช่วง เช่น 16/07/2026,19/07/2026,22-23/07/2026';

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Parse DD/MM/YYYY (or DD-MM-YYYY) input; returns ISO YYYY-MM-DD or null. */
export function parseThaiDateInput(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const [year, month, day] = trimmed.split('-').map(Number) as [number, number, number];
    if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) return null;
    return trimmed;
  }

  const match = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (!match) return null;

  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (year < 1900 || year > new Date().getFullYear() + 1) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;

  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function formatIsoDateAsDdMmYyyy(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [year, month, day] = iso.split('-');
  return `${day}/${month}/${year}`;
}

/** Format YYYY-MM month key as MM/YYYY. */
export function formatYearMonthIsoAsMmYyyy(yearMonth: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(yearMonth.trim());
  if (!match) return yearMonth;
  return `${match[2]}/${match[1]}`;
}

export function parseThaiDateListInput(text: string): string[] | null {
  return parseThaiMultiDateInput(text);
}

function isoFromParts(year: number, month: number, day: number): string | null {
  if (year < 1900 || year > new Date().getFullYear() + 1) return null;
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function expandIsoDateRange(startIso: string, endIso: string): string[] | null {
  const start = parseThaiDateInput(startIso);
  const end = parseThaiDateInput(endIso);
  if (!start || !end) return null;
  if (start > end) return null;

  const dates: string[] = [];
  const cursor = new Date(`${start}T00:00:00.000Z`);
  const endTime = new Date(`${end}T00:00:00.000Z`).getTime();
  while (cursor.getTime() <= endTime) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}

function parseThaiMultiDateSegment(segment: string): string[] | null {
  const trimmed = segment.trim();
  if (!trimmed) return null;

  const single = parseThaiDateInput(trimmed);
  if (single) return [single];

  const dayRangeMatch = /^(\d{1,2})-(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  if (dayRangeMatch) {
    const startDay = Number(dayRangeMatch[1]);
    const endDay = Number(dayRangeMatch[2]);
    const month = Number(dayRangeMatch[3]);
    const year = Number(dayRangeMatch[4]);
    if (endDay < startDay) return null;
    const dates: string[] = [];
    for (let day = startDay; day <= endDay; day += 1) {
      const iso = isoFromParts(year, month, day);
      if (!iso) return null;
      dates.push(iso);
    }
    return dates;
  }

  const fullRangeMatch = /^(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})\s*-\s*(\d{1,2}[/.-]\d{1,2}[/.-]\d{4})$/.exec(trimmed);
  if (fullRangeMatch) {
    return expandIsoDateRange(
      parseThaiDateInput(fullRangeMatch[1]) ?? fullRangeMatch[1],
      parseThaiDateInput(fullRangeMatch[2]) ?? fullRangeMatch[2],
    );
  }

  return null;
}

/** Parse one or many Thai dates (comma-separated and/or day ranges like 22-23/07/2026). */
export function parseThaiMultiDateInput(text: string): string[] | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  const single = parseThaiDateInput(trimmed);
  if (single && !trimmed.includes(',') && !/^\d{1,2}-\d{1,2}[/.-]/.test(trimmed)) {
    return [single];
  }

  const segments = trimmed.split(',').map((part) => part.trim()).filter(Boolean);
  if (!segments.length) return null;

  const isoDates: string[] = [];
  for (const segment of segments) {
    const parsed = parseThaiMultiDateSegment(segment);
    if (!parsed?.length) return null;
    isoDates.push(...parsed);
  }

  return [...new Set(isoDates)].sort();
}

export function isThaiMultiDateInput(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.includes(',') || /^\d{1,2}-\d{1,2}[/.-]/.test(trimmed)
    || /\d{1,2}[/.-]\d{1,2}[/.-]\d{4}\s*-\s*\d{1,2}[/.-]/.test(trimmed);
}
