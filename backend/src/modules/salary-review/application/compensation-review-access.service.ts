// ============================================================================
// modules/salary-review/application/compensation-review-access.service.ts
// SAL-001
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { CompensationReviewForbiddenError } from '../domain/errors/salary-review.errors';

@Injectable()
export class CompensationReviewAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanViewDashboard(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new CompensationReviewForbiddenError();
  }

  async assertCanPropose(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new CompensationReviewForbiddenError('Only Owner, Secretary, or Big Leader may propose reviews');
  }

  async assertCanEdit(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new CompensationReviewForbiddenError('Only Owner or Secretary may edit compensation reviews');
  }

  async assertCanApprove(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner') return;
    throw new CompensationReviewForbiddenError('Only Owner may approve compensation reviews');
  }

  async assertCanViewTimeline(actor: ActorContext, employeeId: string, companyId: string): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;

    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new CompensationReviewForbiddenError('Employees may only view their own compensation timeline');
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }
}
