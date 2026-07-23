// ============================================================================
// Resolves effective permissions: business role bundle → overrides.
// ============================================================================

import { AuthorizationContext } from '../entities/authorization.types';
import { SECRETARY_ROLE_ALIASES } from '../entities/salary-visibility-matrix';

export function resolveEffectivePermissions(ctx: AuthorizationContext): Set<string> {
  const effective = new Set(ctx.permissions);
  for (const override of ctx.overrides) {
    if (override.effect === 'allow') {
      effective.add(override.permission);
    } else {
      effective.delete(override.permission);
    }
  }
  return effective;
}

export function explainSalaryVisibilityRole(businessRole: string | null): string {
  switch (businessRole) {
    case 'owner':
      return 'Owner — all employee salaries, all companies.';
    case 'secretary':
      return `Secretary (${SECRETARY_ROLE_ALIASES.join(', ')}) — all employee salaries, all companies.`;
    case 'big_leader':
      return 'Big leader — all employees in scoped company/companies (company-level).';
    case 'admin_manager':
      return 'Admin manager — own salary only; other employees only with UserPermissionOverride.';
    case 'admin':
      return 'Admin — own salary only; other employees only with UserPermissionOverride.';
    case 'sub_leader':
      return 'Sub leader — own salary only.';
    case 'employee':
      return 'Employee — own salary only.';
    default:
      return 'Deny-by-default — own salary only; other employees only with UserPermissionOverride.';
  }
}
