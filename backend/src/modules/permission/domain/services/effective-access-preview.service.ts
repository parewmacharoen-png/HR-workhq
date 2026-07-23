// ============================================================================
// Human-readable effective access preview (HR-13) — no raw permission keys.
// ============================================================================

import { BusinessRoleCode } from '../entities/business-role.types';

export interface EffectiveAccessPreview {
  roleLabel: string;
  scopeBadge: string;
  can: string[];
  cannot: string[];
  salaryVisibility: string;
}

export class EffectiveAccessPreviewService {
  build(
    role: BusinessRoleCode,
    scopeBadge: string,
    hasSalaryOverride: boolean,
  ): EffectiveAccessPreview {
    const roleLabel = this.label(role);
    const base = this.baseForRole(role, scopeBadge, hasSalaryOverride);
    return {
      roleLabel,
      scopeBadge,
      can: base.can,
      cannot: base.cannot,
      salaryVisibility: base.salaryVisibility,
    };
  }

  private label(role: BusinessRoleCode): string {
    const map: Record<BusinessRoleCode, string> = {
      owner: 'Owner',
      secretary: 'Secretary (HR / Payroll)',
      big_leader: 'Big Leader',
      sub_leader: 'Sub Leader',
      admin_manager: 'Admin Manager',
      admin: 'Admin',
      employee: 'Employee',
    };
    return map[role];
  }

  private baseForRole(
    role: BusinessRoleCode,
    scopeBadge: string,
    hasSalaryOverride: boolean,
  ): { can: string[]; cannot: string[]; salaryVisibility: string } {
    const commonEmployee = [
      'View own profile',
      'View own payslip',
      'Submit leave request',
      'View own attendance',
    ];

    switch (role) {
      case 'owner':
        return {
          can: [
            'Full HR access across all companies',
            'View all employee salaries and payroll',
            'Manage business roles and additional access',
            'Change company and platform settings',
          ],
          cannot: [],
          salaryVisibility: 'All employees, all companies.',
        };
      case 'secretary':
        return {
          can: [
            'View employees across all companies',
            'View salary and payroll across all companies',
            'Manage HR records with limited safe writes',
            'View company-wide HR reports',
          ],
          cannot: [
            'Manage owner permissions',
            'Change global platform settings',
          ],
          salaryVisibility: 'All employees, all companies.',
        };
      case 'big_leader':
        return {
          can: [
            `View employees in scoped companies (${scopeBadge})`,
            'View salary in scoped companies',
            'View company payroll summary in scoped companies',
            'Approve leave for scoped teams',
          ],
          cannot: [
            'View payroll outside scoped companies',
            'Manage owner permissions',
            'Change global platform settings',
          ],
          salaryVisibility: `All employees in scoped companies: ${scopeBadge}.`,
        };
      case 'sub_leader':
        return {
          can: [
            ...commonEmployee,
            `View team members (${scopeBadge})`,
            'Approve leave for scoped team',
          ],
          cannot: [
            "View other employees' salary",
            'View payroll summary',
            'Change company settings',
          ],
          salaryVisibility: 'Own salary only.',
        };
      case 'admin_manager':
        return {
          can: [
            'Manage employee records in assigned companies',
            'Manage attendance and leave operations',
            'View own payslip',
            ...(hasSalaryOverride ? ['View other salaries (owner override granted)'] : []),
          ],
          cannot: [
            ...(hasSalaryOverride ? [] : ["View other employees' salary"]),
            ...(hasSalaryOverride ? [] : ['View payroll summary']),
            'Manage owner permissions',
          ],
          salaryVisibility: hasSalaryOverride
            ? 'Own salary plus override-granted salary access.'
            : 'Own salary only; other access requires Owner override.',
        };
      case 'admin':
        return {
          can: [
            'View employees in assigned companies',
            'Manage attendance',
            'View own payslip',
            ...(hasSalaryOverride ? ['View other salaries (owner override granted)'] : []),
          ],
          cannot: [
            ...(hasSalaryOverride ? [] : ["View other employees' salary"]),
            ...(hasSalaryOverride ? [] : ['View payroll summary']),
            'Change company settings',
          ],
          salaryVisibility: hasSalaryOverride
            ? 'Own salary plus override-granted salary access.'
            : 'Own salary only; other access requires Owner override.',
        };
      case 'employee':
        return {
          can: commonEmployee,
          cannot: [
            "View other employees' salary",
            'View payroll summary',
            'Change company settings',
          ],
          salaryVisibility: 'Own salary only.',
        };
      default:
        return {
          can: commonEmployee,
          cannot: ["View other employees' salary"],
          salaryVisibility: 'Deny-by-default; own salary only unless Owner override.',
        };
    }
  }
}
