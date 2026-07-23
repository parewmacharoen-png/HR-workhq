/**
 * Employee tenure & date display helpers.
 */

export function formatEmployeeDateDdMmYyyy(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const [year, month, day] = isoDate.slice(0, 10).split('-');
  if (!year || !month || !day) return '—';
  return `${day}/${month}/${year}`;
}

export function formatEmployeeDateThaiLong(isoDate: string | null | undefined): string {
  if (!isoDate) return '—';
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('th-TH', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

export function formatAgeYears(ageYears: number | null | undefined): string {
  if (ageYears == null) return '—';
  return `${ageYears} ปี`;
}

export function formatTenureBadge(tenureDisplay: string | null | undefined): string | null {
  if (!tenureDisplay) return null;
  return `🕒 อายุงาน ${tenureDisplay}`;
}

export interface RecognitionDashboardData {
  birthdaysThisMonth: Array<{
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    birthday: string;
  }>;
  anniversariesThisMonth: Array<{
    employeeId: string;
    employeeName: string;
    department: string | null;
    position: string | null;
    milestoneLabel: string;
    anniversaryYears: number;
  }>;
}

export const MILESTONE_ANNIVERSARY_COLUMNS = [1, 2, 3, 5, 10] as const;

export function anniversaryMilestoneFlags(years: number): Record<number, boolean> {
  return Object.fromEntries(MILESTONE_ANNIVERSARY_COLUMNS.map((y) => [y, y === years]));
}
