import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { RequestForbiddenError } from '../domain/errors/request.errors';

@Injectable()
export class RequestAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    private readonly hierarchy: HierarchyResolverService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanManageTypes(actor: ActorContext, companyId?: string | null): Promise<void> {
    if (companyId) await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new RequestForbiddenError('Only Owner or Secretary may manage request types');
  }

  async assertCanViewCompanyRequests(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader' || role === 'sub_leader') {
      return;
    }
    throw new RequestForbiddenError();
  }

  async assertCanViewRequest(
    actor: ActorContext,
    requesterEmployeeId: string,
    companyId: string,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === requesterEmployeeId) return;
    await this.assertCanViewCompanyRequests(actor, companyId);
    const role = access?.businessRole ?? null;
    if (role === 'sub_leader') {
      await this.assertTeamMember(access?.employeeId ?? null, requesterEmployeeId);
    }
  }

  async assertCanApproveStep(
    actor: ActorContext,
    approverEmployeeId: string | null,
    companyId: string,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (approverEmployeeId && access?.employeeId === approverEmployeeId) return;
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary') {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
      return;
    }
    throw new RequestForbiddenError('Not assigned approver for this step');
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }

  private async assertTeamMember(
    leaderEmployeeId: string | null,
    memberEmployeeId: string,
  ): Promise<void> {
    if (!leaderEmployeeId) throw new RequestForbiddenError();
    const descendants = await this.hierarchy.getDescendantEmployeeIds(leaderEmployeeId);
    if (!descendants.includes(memberEmployeeId)) {
      throw new RequestForbiddenError('Employee not in your team scope');
    }
  }
}
