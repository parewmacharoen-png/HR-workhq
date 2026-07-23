// ============================================================================
// HR-13 validation rules for business role + scope assignment.
// ============================================================================

import { BusinessRoleCode } from '../entities/business-role.types';
import { AccessControlValidationError } from '../errors/access-control.errors';
import { PAYROLL_OVERRIDE_PERMISSIONS } from '../entities/salary-visibility-matrix';

const ROLES_WITHOUT_MANUAL_SCOPE: BusinessRoleCode[] = [
  'owner', 'secretary', 'admin_manager', 'admin', 'employee',
];

const HARD_SELF_ONLY_ROLES: BusinessRoleCode[] = ['sub_leader', 'employee'];

const ALLOWED_OVERRIDE_PERMISSIONS = [
  'salary:read',
  'payroll:read',
  'employee:export',
  'employee:onboarding:invite:view',
  'employee:onboarding:invite:create',
  'employee:onboarding:invite:manage',
  'employee:onboarding:invite:cancel',
  'employee:onboarding:invite:regenerate',
  'employee:onboarding:invite:link-existing',
  'employee:onboarding:invite:new-employee',
] as const;

export interface RoleAssignmentInput {
  role: BusinessRoleCode;
  companyScopeIds: string[];
  teamScopeIds: string[];
}

export class AccessControlValidationService {
  validateRoleAssignment(input: RoleAssignmentInput): void {
    if (ROLES_WITHOUT_MANUAL_SCOPE.includes(input.role)) {
      if (input.companyScopeIds.length > 0 || input.teamScopeIds.length > 0) {
        throw new AccessControlValidationError(
          'SCOPE_NOT_ALLOWED',
          `${input.role} must not have manually assigned company or team scope.`,
        );
      }
    }

    if (input.role === 'big_leader' && input.companyScopeIds.length === 0) {
      throw new AccessControlValidationError(
        'COMPANY_SCOPE_REQUIRED',
        'Big Leader must have at least one company scope.',
      );
    }

    if (input.role === 'sub_leader' && input.teamScopeIds.length === 0) {
      throw new AccessControlValidationError(
        'TEAM_SCOPE_REQUIRED',
        'Sub Leader must have at least one team scope.',
      );
    }
  }

  assertCanChangeFromOwner(
    currentRole: BusinessRoleCode | null,
    newRole: BusinessRoleCode,
    activeOwnerCount: number,
  ): void {
    if (currentRole === 'owner' && newRole !== 'owner' && activeOwnerCount < 1) {
      throw new AccessControlValidationError(
        'OWNER_REQUIRED',
        'At least one Owner must always exist. Cannot demote or remove the last Owner.',
      );
    }
  }

  /** Who may assign business roles from the employee admin UI. */
  assertActorCanAssignBusinessRole(
    actorRole: BusinessRoleCode | null,
    targetCurrentRole: BusinessRoleCode | null,
    newRole: BusinessRoleCode,
  ): void {
    const actor = actorRole ?? 'employee';
    if (actor !== 'owner' && actor !== 'secretary') {
      throw new AccessControlValidationError(
        'ROLE_CHANGE_FORBIDDEN',
        'Only Owner or Secretary can change business roles.',
      );
    }
    if (newRole === 'owner' && actor !== 'owner') {
      throw new AccessControlValidationError(
        'ASSIGN_OWNER_FORBIDDEN',
        'Only Owner can assign the Owner role.',
      );
    }
    if (targetCurrentRole === 'owner' && actor !== 'owner') {
      throw new AccessControlValidationError(
        'ASSIGN_OWNER_FORBIDDEN',
        'Only Owner can change an existing Owner role.',
      );
    }
  }

  validateOverride(
    targetRole: BusinessRoleCode | null,
    permission: string,
    effect: 'allow' | 'deny',
  ): void {
    if (!ALLOWED_OVERRIDE_PERMISSIONS.includes(permission as typeof ALLOWED_OVERRIDE_PERMISSIONS[number])) {
      throw new AccessControlValidationError(
        'SCOPE_NOT_ALLOWED',
        `Override permission "${permission}" is not allowed. Use: ${ALLOWED_OVERRIDE_PERMISSIONS.join(', ')}.`,
      );
    }

    if (
      effect === 'allow'
      && targetRole
      && HARD_SELF_ONLY_ROLES.includes(targetRole)
      && PAYROLL_OVERRIDE_PERMISSIONS.includes(permission as typeof PAYROLL_OVERRIDE_PERMISSIONS[number])
    ) {
      throw new AccessControlValidationError(
        'HARD_SELF_ONLY',
        'Sub Leader and Employee cannot receive salary or payroll overrides for other employees.',
      );
    }
  }

  buildScopesForRole(
    role: BusinessRoleCode,
    companyScopeIds: string[],
    teamScopeIds: string[],
  ): Array<{ scopeType: 'all' | 'company' | 'team' | 'self'; companyId?: string | null; teamId?: string | null }> {
    switch (role) {
      case 'owner':
      case 'secretary':
        return [{ scopeType: 'all' }];
      case 'big_leader':
        return companyScopeIds.map((companyId) => ({ scopeType: 'company' as const, companyId }));
      case 'sub_leader':
        return teamScopeIds.map((teamId) => ({ scopeType: 'team' as const, teamId }));
      case 'admin_manager':
      case 'admin':
        if (companyScopeIds.length > 0) {
          return companyScopeIds.map((companyId) => ({ scopeType: 'company' as const, companyId }));
        }
        return [{ scopeType: 'self' }];
      case 'employee':
        return [{ scopeType: 'self' }];
      default:
        return [{ scopeType: 'self' }];
    }
  }

  roleLabel(role: BusinessRoleCode): string {
    const labels: Record<BusinessRoleCode, string> = {
      owner: 'Owner',
      secretary: 'Secretary (HR / Payroll)',
      big_leader: 'Big Leader',
      sub_leader: 'Sub Leader',
      admin_manager: 'Admin Manager',
      admin: 'Admin',
      employee: 'Employee',
    };
    return labels[role];
  }

  scopeBadge(
    role: BusinessRoleCode,
    companyNames: string[],
    teamNames: string[],
  ): string {
    if (role === 'owner' || role === 'secretary') return 'All companies';
    if (role === 'big_leader') {
      return companyNames.length ? companyNames.join(', ') : 'No company scope';
    }
    if (role === 'sub_leader') {
      return teamNames.length ? teamNames.join(', ') : 'No team scope';
    }
    return 'Self only';
  }
}
