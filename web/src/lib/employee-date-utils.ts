const NO_DATE = '—';
const NO_DATA = 'ยังไม่มีข้อมูล';

function parseDateOnly(isoDate: string): Date | null {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatThaiDate(date: string | null): string {
  if (!date) return NO_DATE;
  const parsed = parseDateOnly(date);
  if (!parsed) return NO_DATE;
  return parsed.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function calculateAge(dateOfBirth: string | null): string {
  if (!dateOfBirth) return NO_DATA;
  const birth = parseDateOnly(dateOfBirth);
  if (!birth) return NO_DATA;
  const today = new Date();
  let years = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
    years -= 1;
  }
  if (years < 0) return NO_DATA;
  return `${years} ปี`;
}

export function calculateTenure(startDate: string | null): string {
  if (!startDate) return NO_DATA;
  const start = parseDateOnly(startDate);
  if (!start) return NO_DATA;
  const today = new Date();
  let months = (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth());
  if (today.getDate() < start.getDate()) months -= 1;
  if (months < 0) return NO_DATA;
  const years = Math.floor(months / 12);
  const rem = months % 12;
  if (years === 0) return `${rem} เดือน`;
  if (rem === 0) return `${years} ปี`;
  return `${years} ปี ${rem} เดือน`;
}

export function daysUntilBirthday(dateOfBirth: string | null): number | null {
  if (!dateOfBirth) return null;
  const birth = parseDateOnly(dateOfBirth);
  if (!birth) return null;
  const today = new Date();
  const next = new Date(today.getFullYear(), birth.getMonth(), birth.getDate());
  if (next < today) {
    next.setFullYear(today.getFullYear() + 1);
  }
  const diffMs = next.getTime() - today.setHours(0, 0, 0, 0);
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

export { NO_DATA };
