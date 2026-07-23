export interface SalaryViewerContext {
  userId?: string | null;
  employeeId?: string | null;
  businessRole?: string | null;
  permissions?: string[];
}

/** Client-side salary visibility (mirrors backend policy at a high level). */
export function canViewEmployeeSalary(
  viewer: SalaryViewerContext,
  targetEmployeeId: string,
): boolean {
  if (!targetEmployeeId) return false;
  if (viewer.employeeId && viewer.employeeId === targetEmployeeId) return true;

  const role = viewer.businessRole ?? '';
  if (role === 'owner' || role === 'secretary') return true;
  if (role === 'big_leader' && viewer.permissions?.includes('payroll:read')) return true;

  return false;
}

export function salaryDeniedMessage(): string {
  return 'คุณไม่มีสิทธิ์ดูข้อมูลเงินเดือนของพนักงานคนนี้';
}
