import { apiGet, apiPatch, apiPost } from './client';

export interface SharedPayrollInfo {
  employeeId: string;
  qualifies: boolean;
  mode: 'standard' | 'shared_across_companies';
  masterMonthlySalary: number | null;
  depositCollectionCompanyId: string | null;
  activeCompanyCount: number;
  perCompanySalary: number | null;
  department: string | null;
  position: string | null;
}

export interface MigrateSharedPayrollResult {
  employeeId: string;
  globalId: string;
  migrated: boolean;
  reason?: string;
  masterMonthlySalary?: number;
}

export function fetchSharedPayrollInfo(employeeId: string) {
  return apiGet<SharedPayrollInfo>(`/employees/${employeeId}/shared-payroll`);
}

export function updateSharedPayrollSettings(
  employeeId: string,
  body: {
    masterMonthlySalary?: number;
    depositCollectionCompanyId?: string | null;
    effectiveFrom?: string;
  },
) {
  return apiPatch<SharedPayrollInfo>(`/employees/${employeeId}/shared-payroll`, body);
}

export function migrateSharedPayrollEmployees(employeeId?: string) {
  const q = employeeId ? `?employeeId=${encodeURIComponent(employeeId)}` : '';
  return apiPost<MigrateSharedPayrollResult[]>(`/payroll/shared/migrate${q}`, {});
}

export function reconcileSharedPayroll() {
  return apiPost<{ employeesUpdated: number }>('/payroll/shared/reconcile', {});
}
