/** Standard department options — prevents free-text typos. */
export const EMPLOYEE_DEPARTMENT_OPTIONS = [
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Admin', label: 'Admin' },
  { value: 'เลขา', label: 'เลขา' },
] as const;

/** Standard position options — HR-facing job titles. */
export const EMPLOYEE_POSITION_OPTIONS = [
  { value: 'หัวหน้าทีมใหญ่', label: 'หัวหน้าทีมใหญ่' },
  { value: 'หัวหน้าทีมย่อย', label: 'หัวหน้าทีมย่อย' },
  { value: 'พนักงาน', label: 'พนักงาน' },
  { value: 'แอดมิน', label: 'แอดมิน' },
  { value: 'ออดิท', label: 'ออดิท' },
  { value: 'เลขา', label: 'เลขา' },
] as const;

export function departmentLabel(value: string | null | undefined): string {
  if (!value) return '';
  return EMPLOYEE_DEPARTMENT_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export function positionLabel(value: string | null | undefined): string {
  if (!value) return '';
  return EMPLOYEE_POSITION_OPTIONS.find((o) => o.value === value)?.label ?? value;
}
