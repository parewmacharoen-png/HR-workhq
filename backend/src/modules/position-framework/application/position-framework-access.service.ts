// ============================================================================
// modules/position-framework/application/position-framework-access.service.ts
// KPI-004 — Owner all companies, Secretary company scope
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { PositionFrameworkForbiddenError } from '../domain/errors/position-framework.errors';

@Injectable()
export class PositionFrameworkAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanManage(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new PositionFrameworkForbiddenError('Only Owner or Secretary may manage the position framework');
  }

  async assertCanView(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new PositionFrameworkForbiddenError();
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }
}
