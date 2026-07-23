// ============================================================================
// Hard-coded salary visibility policy (HR-12). Independent of generic RBAC.
// Deny-by-default: only matrix-listed roles get explicit broader access.
// Unlisted roles (including no business role) → self only + override for others.
// ============================================================================

import { BusinessRoleCode } from '../entities/business-role.types';
import {
  PAYROLL_OVERRIDE_PERMISSIONS,
  SECRETARY_ROLE_ALIASES,
  isSalaryMatrixRole,
} from '../entities/salary-visibility-matrix';
import { PermissionOverrideRow, ScopeGrant } from '../entities/authorization.types';

export interface SalaryVisibilityContext {
  viewerUserId: string;
  viewerEmployeeId: string | null;
  businessRole: BusinessRoleCode | null;
  scopes: ScopeGrant[];
  overrides: PermissionOverrideRow[];
}

export interface SalaryVisibilityDecision {
  canView: boolean;
  reason: string;
}

export class SalaryVisibilityPolicy {
  decide(
    ctx: SalaryVisibilityContext,
    targetEmployeeId: string,
    targetCompanyIds: string[],
  ): SalaryVisibilityDecision {
    if (ctx.viewerEmployeeId && ctx.viewerEmployeeId === targetEmployeeId) {
      return { canView: true, reason: 'Own salary — always visible to self.' };
    }

    const role = ctx.businessRole;

    if (!isSalaryMatrixRole(role)) {
      return this.selfOnlyUnlessOverride('Role not in salary visibility matrix', ctx);
    }

    switch (role) {
      case 'owner':
        return { canView: true, reason: 'Owner may view all employee salaries across all companies.' };
      case 'secretary':
        return {
          canView: true,
          reason: `Secretary (${SECRETARY_ROLE_ALIASES.join(' / ')}) may view all employee salaries across all companies.`,
        };
      case 'big_leader':
        return this.bigLeaderDecision(ctx, targetCompanyIds);
      case 'sub_leader':
        return { canView: false, reason: 'Sub leader may view own salary only (no override path).' };
      case 'admin_manager':
        return this.selfOnlyUnlessOverride('Admin manager', ctx);
      case 'admin':
        return this.selfOnlyUnlessOverride('Admin', ctx);
      case 'employee':
        return { canView: false, reason: 'Employee may view own salary only (no override path).' };
      default:
        return this.selfOnlyUnlessOverride('Role not in salary visibility matrix', ctx);
    }
  }

  /** Company-level payroll aggregates (dashboards, AI summary tools). */
  decideCompanyPayrollSummary(
    ctx: SalaryVisibilityContext,
    companyId: string,
  ): SalaryVisibilityDecision {
    const role = ctx.businessRole;

    if (!isSalaryMatrixRole(role)) {
      return this.selfOnlyUnlessOverride('Role not in salary visibility matrix', ctx, 'payroll summary');
    }

    if (role === 'owner') {
      return { canView: true, reason: 'Owner may view payroll summaries for all companies.' };
    }
    if (role === 'secretary') {
      return {
        canView: true,
        reason: 'Secretary / HR Manager / payroll operator may view payroll summaries for all companies.',
      };
    }
    if (role === 'big_leader') {
      const inScope = ctx.scopes.some(
        (g) => g.scopeType === 'all'
          || (g.scopeType === 'company' && g.companyId === companyId),
      );
      return inScope
        ? { canView: true, reason: 'Big leader may view payroll summary within scoped company/companies.' }
        : { canView: false, reason: 'Company is outside big leader scope for payroll summary.' };
    }
    if (role === 'admin' || role === 'admin_manager') {
      return this.selfOnlyUnlessOverride(
        role === 'admin_manager' ? 'Admin manager' : 'Admin',
        ctx,
        'payroll summary',
      );
    }
    if (role === 'sub_leader' || role === 'employee') {
      return {
        canView: false,
        reason: `${role === 'sub_leader' ? 'Sub leader' : 'Employee'} may not view company payroll summaries.`,
      };
    }
    return this.selfOnlyUnlessOverride('Role not in salary visibility matrix', ctx, 'payroll summary');
  }

  private bigLeaderDecision(
    ctx: SalaryVisibilityContext,
    targetCompanyIds: string[],
  ): SalaryVisibilityDecision {
    const viewerCompanies = new Set<string>();
    for (const grant of ctx.scopes) {
      if (grant.scopeType === 'all') {
        return {
          canView: true,
          reason: 'Big leader with all scope may view salaries in any company.',
        };
      }
      if (grant.scopeType === 'company' && grant.companyId) {
        viewerCompanies.add(grant.companyId);
      }
    }
    const overlap = targetCompanyIds.some((id) => viewerCompanies.has(id));
    if (overlap) {
      return {
        canView: true,
        reason: 'Big leader may view salaries for all employees in scoped company/companies.',
      };
    }
    return {
      canView: false,
      reason: 'Target employee is outside big leader company scope for salary visibility.',
    };
  }

  /** Deny-by-default for other employees' salary; override may grant access. */
  private selfOnlyUnlessOverride(
    roleLabel: string,
    ctx: SalaryVisibilityContext,
    resource = 'salary',
  ): SalaryVisibilityDecision {
    const hasOverride = ctx.overrides.some(
      (o) => o.effect === 'allow'
        && PAYROLL_OVERRIDE_PERMISSIONS.includes(o.permission as typeof PAYROLL_OVERRIDE_PERMISSIONS[number]),
    );
    if (hasOverride) {
      return {
        canView: true,
        reason: `${roleLabel} with UserPermissionOverride (${PAYROLL_OVERRIDE_PERMISSIONS.join(' or ')}) may view ${resource}.`,
      };
    }
    return {
      canView: false,
      reason: `${roleLabel}: deny-by-default — own salary only; other employee ${resource} requires UserPermissionOverride.`,
    };
  }
}

export const SALARY_MASK = '***' as const;

export function maskSalaryAmount(_value: number | null | undefined): string {
  return SALARY_MASK;
}

export function maskPayslip<T extends { gross?: number; deductions?: number; net?: number }>(
  payslip: T,
): T & { salaryMasked: true } {
  return {
    ...payslip,
    gross: undefined,
    deductions: undefined,
    net: undefined,
    salaryMasked: true,
  };
}
