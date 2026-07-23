import { apiGet, apiPatch } from './client';

export interface EmployeeEmploymentRef {
  id: string;
  globalId: string;
  name: string;
}

export interface EmployeeEmploymentData {
  employeeCode: string;
  companyId: string | null;
  companyName: string | null;
  department: string | null;
  teamId: string | null;
  teamName: string | null;
  businessRole: string | null;
  position: string | null;
  employmentType: string | null;
  employmentStatus: string;
  joinDate: string;
  probationEndDate: string | null;
  confirmedDate: string | null;
  resignDate: string | null;
  shift: string | null;
  officeType: 'front_office' | 'back_office' | null;
  workLocation: string | null;
}

export interface EmployeeCompanyAssignment {
  companyId: string;
  companyName: string;
  companyCode: string;
  teamId: string | null;
  teamName: string | null;
  isPrimary: boolean;
}

export interface EmployeeEmploymentResponse {
  employment: EmployeeEmploymentData;
  companyAssignments?: EmployeeCompanyAssignment[];
  shiftProfile?: import('./shift-assignments').EmployeeShiftProfile;
  supervisor: EmployeeEmploymentRef | null;
  bigLeader: EmployeeEmploymentRef | null;
  subLeader: EmployeeEmploymentRef | null;
  roleEditor?: {
    canEditBusinessRole: boolean;
    canAssignOwnerRole: boolean;
  };
}

export type UpdateEmployeeEmploymentPayload = {
  companyId?: string;
  teamId?: string;
  companyAssignments?: Array<{
    companyId: string;
    teamId?: string | null;
    department?: string;
  }>;
  department?: string;
  position?: string;
  employmentType?: string;
  employmentStatus?: 'probation' | 'active' | 'suspended' | 'terminated';
  joinDate?: string;
  probationEndDate?: string;
  resignDate?: string;
  supervisorId?: string;
  workLocation?: 'office' | 'wfh';
  shift?: 'day' | 'night';
  officeType?: 'front_office' | 'back_office';
  reason?: string;
};

export interface TeamOption {
  id: string;
  companyId: string;
  name: string;
}

export function fetchEmployeeEmployment(employeeId: string, companyId?: string) {
  const params = companyId ? { companyId } : undefined;
  return apiGet<EmployeeEmploymentResponse>(`/employees/${employeeId}/employment`, params);
}

export function updateEmployeeEmployment(
  employeeId: string,
  body: UpdateEmployeeEmploymentPayload,
  companyId?: string,
) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return apiPatch<EmployeeEmploymentResponse>(`/employees/${employeeId}/employment${query}`, body);
}

export function updateEmployeeBusinessRole(
  employeeId: string,
  body: { businessRole: string; reason?: string },
  companyId?: string,
) {
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : '';
  return apiPatch<EmployeeEmploymentResponse>(`/employees/${employeeId}/business-role${query}`, body);
}

export const EDITABLE_BUSINESS_ROLES = [
  'owner',
  'secretary',
  'big_leader',
  'sub_leader',
  'admin_manager',
  'admin',
  'employee',
] as const;

export function isEmploymentRoleEditorEnabled(
  roleEditor: EmployeeEmploymentResponse['roleEditor'] | undefined,
  viewerBusinessRole?: string | null,
): boolean {
  if (roleEditor?.canEditBusinessRole === true) return true;
  return viewerBusinessRole === 'owner' || viewerBusinessRole === 'secretary';
}

export function fetchCompanyTeams(companyId: string, department?: string) {
  const params: Record<string, string> = { companyId };
  if (department) params.department = department;
  return apiGet<TeamOption[]>('/employees/assignment-teams', params);
}
