// ============================================================================
// Export permission & access control
// ============================================================================

import { Injectable, Inject } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { SENSITIVE_EXPORT_MODULES } from '../domain/export.types';

@Injectable()
export class ExportAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanExport(actor: ActorContext, companyId: string, module: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';

    if (role === 'owner') return;

    if (SENSITIVE_EXPORT_MODULES.has(module)) {
      if (role !== 'secretary') {
        throw new Error(`Export denied for sensitive module: ${module}`);
      }
      return;
    }

    if (role === 'employee') {
      throw new Error('Employees cannot run company exports');
    }

    if ((role === 'big_leader' || role === 'sub_leader') && !SENSITIVE_EXPORT_MODULES.has(module)) {
      return;
    }

    if (['payroll', 'salary', 'salary_history', 'salary_review'].includes(module)) {
      if (!this.hasOverride(access, 'payroll:read') && !this.hasOverride(access, 'employee:export')) {
        throw new Error('Payroll export permission required');
      }
    }

    if (module === 'employees') {
      if (!this.hasOverride(access, 'employee:export') && !this.hasOverride(access, 'employee:read')) {
        throw new Error('employee:export permission required');
      }
    }
  }

  async assertCanListExports(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? 'employee';
    if (role === 'owner' || role === 'secretary') return;
    if (this.hasOverride(access, 'settings:read') || this.hasOverride(access, 'employee:export')) return;
    throw new Error('Export history access denied');
  }

  private hasOverride(
    access: Awaited<ReturnType<BusinessPermissionRepository['findUserAccess']>>,
    permission: string,
  ): boolean {
    if (!access) return false;
    if (access.overrides.some((o) => o.permission === permission && o.effect === 'deny')) return false;
    return access.overrides.some((o) => o.permission === permission && o.effect === 'allow');
  }
}
