import type { EmployeeListItem } from '../api/employees';

export function employeeFullName(
  employee: Pick<EmployeeListItem, 'firstName' | 'lastName'>,
): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

/** Text used for client-side filtering in comboboxes. */
export function employeeSearchHaystack(employee: EmployeeListItem): string {
  return [
    employee.globalId,
    employee.firstName,
    employee.lastName,
    employee.nickname,
    employee.teamName,
    employee.department,
    employee.position,
    employee.email,
    employee.phone,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
}

/** Secondary line under the name in dropdown options. */
export function employeeOptionMeta(employee: EmployeeListItem): string {
  const parts = [employee.globalId];
  if (employee.teamName) parts.push(employee.teamName);
  if (employee.position) parts.push(employee.position);
  return parts.join(' · ');
}

/** Compact single-line label for selected value / chips. */
export function employeeCompactLabel(employee: EmployeeListItem): string {
  const name = employeeFullName(employee);
  const nick = employee.nickname ? ` (${employee.nickname})` : '';
  const team = employee.teamName ? ` · ${employee.teamName}` : '';
  return `${employee.globalId} · ${name}${nick}${team}`;
}
