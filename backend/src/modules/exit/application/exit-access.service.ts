// ============================================================================
// modules/exit/application/exit-access.service.ts
// EMP-012 — role-based exit case read/manage access.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { ForbiddenError } from '../../../shared/kernel/domain-error';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';

@Injectable()
export class ExitAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanRead(actor: ActorContext, employeeId: string, companyId: string): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;

    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);
    await this.companyAccess.assertCompanyAccess(actor, companyId);

    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;

    throw new ForbiddenError('You do not have permission to view this exit case');
  }

  async assertCanManage(actor: ActorContext, employeeId: string, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new ForbiddenError('Only Owner, Secretary, or Big Leader may manage exit cases');
  }

  async assertCanReadDashboard(actor: ActorContext, companyId: string): Promise<BusinessRoleCode | null> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return role;
    throw new ForbiddenError('Exit dashboard is available to Owner, Secretary, and Big Leader only');
  }

  async assertCanCancel(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new ForbiddenError('Only Owner or Secretary may cancel exit cases');
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }
}
