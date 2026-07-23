// ============================================================================
// modules/payroll/application/payroll-export-access.service.ts
// PAY-006 — role-based bank transfer export access.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { PayrollExportForbiddenError } from '../domain/errors/payroll-export.errors';

@Injectable()
export class PayrollExportAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanExport(actor: ActorContext, companyId: string): Promise<void> {
    await this.assertCanDownload(actor, companyId);
  }

  async assertCanDownload(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new PayrollExportForbiddenError();
  }

  async assertOwnerConfirmExceptions(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner') return;
    throw new PayrollExportForbiddenError('Only Owner may confirm export with exceptions');
  }

  async isOwner(actor: ActorContext): Promise<boolean> {
    return (await this.actorRole(actor.userId)) === 'owner';
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }
}
