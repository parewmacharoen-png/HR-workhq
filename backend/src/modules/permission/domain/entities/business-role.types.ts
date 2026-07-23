// ============================================================================
// Business role codes and metadata for HR-12 role-first access control.
// ============================================================================

export const BUSINESS_ROLE_CODES = [
  'owner',
  'secretary',
  'big_leader',
  'sub_leader',
  'admin_manager',
  'admin',
  'employee',
] as const;

export type BusinessRoleCode = (typeof BUSINESS_ROLE_CODES)[number];

export interface BusinessRoleTemplate {
  code: BusinessRoleCode;
  name: string;
  description: string;
  defaultScopeType: 'all' | 'company' | 'team' | 'self';
  permissions: string[];
}

export interface PermissionOverrideRow {
  permission: string;
  effect: 'allow' | 'deny';
}

export interface UserAccessSnapshot {
  userId: string;
  username: string;
  employeeId: string | null;
  businessRole: BusinessRoleCode | null;
  scopes: Array<{
    id: string;
    scopeType: string;
    companyId: string | null;
    teamId: string | null;
  }>;
  effectivePermissions: string[];
  overrides: Array<{
    id: string;
    permission: string;
    effect: 'allow' | 'deny';
    reason: string | null;
    createdAt: string;
  }>;
  salaryVisibilityNote: string;
}

export interface SalaryVisibilityResult {
  canView: boolean;
  reason: string;
}
