export const THAI_DATE_INPUT_HINT = 'วัน/เดือน/ปี (เช่น 05/06/2026)';
export const THAI_DATE_PLACEHOLDER = 'วว/ดด/ปปปป';

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

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

export function formatIsoDateAsDdMmYyyy(iso: string | null | undefined): string {
  if (!iso) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso.slice(0, 10))) return iso;
  const [year, month, day] = iso.slice(0, 10).split('-');
  return `${day}/${month}/${year}`;
}
