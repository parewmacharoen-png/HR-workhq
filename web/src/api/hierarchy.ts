import { apiGet, apiPatch } from './client';

export interface HierarchyEmployee {
  employeeId: string;
  globalId: string;
  firstName: string;
  lastName: string;
  position: string | null;
  department: string | null;
  roleLevel: string | null;
  businessRole: string | null;
}

export interface ReportingPathNode extends HierarchyEmployee {
  relationshipType: string | null;
}

export interface OrganizationTreeNode extends HierarchyEmployee {
  directReportCount: number;
  children: OrganizationTreeNode[];
}

export interface DirectReportItem extends HierarchyEmployee {
  employmentStatus: string;
}

export interface HierarchySummary {
  employeeId: string;
  directReportCount: number;
  teamSize: number;
  pendingLeaveCount: number;
  pendingApprovalCount: number;
  lateArrivalCountToday: number;
}

export async function fetchOrganizationTree(companyId: string) {
  return apiGet<{ companyId: string; nodes: OrganizationTreeNode[] }>('/organization/tree', { companyId });
}

export async function fetchReportingPath(employeeId: string) {
  return apiGet<{ employeeId: string; path: ReportingPathNode[] }>(`/employees/${employeeId}/reporting-path`);
}

export async function fetchDirectReports(employeeId: string) {
  return apiGet<{ employeeId: string; items: DirectReportItem[]; total: number }>(`/employees/${employeeId}/direct-reports`);
}

export async function fetchHierarchySummary(employeeId: string, companyId?: string) {
  return apiGet<HierarchySummary>(`/employees/${employeeId}/hierarchy-summary`, { companyId });
}

export async function updateReportingLine(
  employeeId: string,
  input: { managerEmployeeId: string | null; companyId?: string },
) {
  const qs = input.companyId ? `?companyId=${encodeURIComponent(input.companyId)}` : '';
  return apiPatch<{ employeeId: string; managerEmployeeId: string | null }>(
    `/employees/${employeeId}/reporting-line${qs}`,
    { managerEmployeeId: input.managerEmployeeId },
  );
}
