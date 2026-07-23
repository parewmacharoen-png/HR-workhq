// ============================================================================
// modules/employee/application/employee-recognition-access.service.ts
// EMP-011 — role-based recognition read/create access.
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
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { EmployeeAccessService } from './employee-access.service';

@Injectable()
export class EmployeeRecognitionAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly hierarchy: HierarchyResolverService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanRead(actor: ActorContext, employeeId: string, companyId: string): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;

    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);
    await this.companyAccess.assertCompanyAccess(actor, companyId);

    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;

    if (role === 'sub_leader') {
      if (!access?.employeeId) throw new ForbiddenError('Sub leader must be linked to an employee record');
      const teamIds = await this.hierarchy.getDescendantEmployeeIds(access.employeeId);
      const allowed = new Set([access.employeeId, ...teamIds]);
      if (!allowed.has(employeeId)) {
        throw new ForbiddenError('Sub leaders may only view recognitions for their team');
      }
      return;
    }

    throw new ForbiddenError('You do not have permission to view this recognition');
  }

  async assertCanCreate(actor: ActorContext, employeeId: string, companyId: string): Promise<void> {
    await this.employeeAccess.assertEmployeeWritable(actor, employeeId, companyId);

    const access = await this.permissions.findUserAccess(actor.userId);
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;

    throw new ForbiddenError('Only Owner, Secretary, or Big Leader may create awards');
  }

  async assertCanReadCompanyDashboard(actor: ActorContext, companyId: string): Promise<BusinessRoleCode | null> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    return access?.businessRole ?? null;
  }
}
