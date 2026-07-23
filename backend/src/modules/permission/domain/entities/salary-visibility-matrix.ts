// ============================================================================
// FINAL salary visibility matrix (HR-12). Single source of truth for policy + docs.
// ============================================================================

import { BusinessRoleCode } from './business-role.types';

/** Secretary, HR Manager, and payroll operator map to the `secretary` business role. */
export const SECRETARY_ROLE_ALIASES = ['HR Manager', 'Payroll Operator'] as const;

export type SalaryVisibilityScope =
  | 'all_companies'
  | 'scoped_companies'
  | 'self_only'
  | 'self_only_unless_override';

export interface SalaryVisibilityMatrixRow {
  role: BusinessRoleCode;
  label: string;
  scope: SalaryVisibilityScope;
  description: string;
}

/** Final matrix — do not change without product sign-off. */
export const SALARY_VISIBILITY_MATRIX: SalaryVisibilityMatrixRow[] = [
  {
    role: 'owner',
    label: 'Owner',
    scope: 'all_companies',
    description: 'All employees, all companies.',
  },
  {
    role: 'secretary',
    label: 'Secretary / HR Manager / Payroll Operator',
    scope: 'all_companies',
    description: 'All employees, all companies (one business role: secretary).',
  },
  {
    role: 'big_leader',
    label: 'Big Leader',
    scope: 'scoped_companies',
    description: 'All employees in viewer scoped company/companies (company-level, not team).',
  },
  {
    role: 'sub_leader',
    label: 'Sub Leader',
    scope: 'self_only',
    description: 'Own salary only.',
  },
  {
    role: 'admin_manager',
    label: 'Admin Manager',
    scope: 'self_only_unless_override',
    description: 'Own salary only; other employees only via UserPermissionOverride.',
  },
  {
    role: 'admin',
    label: 'Admin',
    scope: 'self_only_unless_override',
    description: 'Own salary only; other employees only via UserPermissionOverride.',
  },
  {
    role: 'employee',
    label: 'Employee',
    scope: 'self_only',
    description: 'Own salary only.',
  },
];

export const PAYROLL_OVERRIDE_PERMISSIONS = ['salary:read', 'payroll:read'] as const;

/** Business roles with explicit salary visibility rules in the matrix. */
export const SALARY_MATRIX_ROLE_CODES = new Set<BusinessRoleCode>(
  SALARY_VISIBILITY_MATRIX.map((row) => row.role),
);

export function isSalaryMatrixRole(role: string | null | undefined): role is BusinessRoleCode {
  return !!role && SALARY_MATRIX_ROLE_CODES.has(role as BusinessRoleCode);
}

/**
 * Deny-by-default: roles not in SALARY_VISIBILITY_MATRIX may view own salary only.
 * Other employees' salary requires UserPermissionOverride.
 */
export const SALARY_VISIBILITY_DENY_BY_DEFAULT = true as const;

/** AI tools that expose salary/payroll amounts — guarded by SalaryVisibilityPolicy. */
export const SALARY_SENSITIVE_AI_TOOLS = [
  'get_latest_payslip',
  'get_my_latest_payslip',
  'get_my_payroll_summary',
  'get_payroll_summary',
] as const;
