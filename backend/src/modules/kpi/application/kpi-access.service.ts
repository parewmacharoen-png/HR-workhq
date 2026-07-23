// ============================================================================
// modules/kpi/application/kpi-access.service.ts
// KPI-001 — role-based KPI access
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { HierarchyResolverService } from '../../hierarchy/application/hierarchy-resolver.service';
import { KpiForbiddenError } from '../domain/errors/kpi.errors';

export interface KpiAssignmentContext {
  employeeId: string;
  reviewerId: string | null;
  companyId: string;
}

@Injectable()
export class KpiAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    private readonly hierarchy: HierarchyResolverService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanManageTemplates(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new KpiForbiddenError('Only Owner or Secretary may manage KPI templates');
  }

  async assertCanViewTemplates(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new KpiForbiddenError();
  }

  async assertCanManageCycles(actor: ActorContext, companyId: string): Promise<void> {
    await this.assertCanManageTemplates(actor, companyId);
  }

  async assertCanAssign(actor: ActorContext, companyId: string): Promise<void> {
    await this.assertCanManageTemplates(actor, companyId);
  }

  async assertCanViewDashboard(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new KpiForbiddenError();
  }

  async assertCanViewCycleAssignments(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader' || role === 'sub_leader') {
      return;
    }
    throw new KpiForbiddenError();
  }

  async assertCanViewEmployeeKpi(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;

    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;

    if (role === 'sub_leader') {
      await this.assertTeamMember(access?.employeeId ?? null, employeeId);
      return;
    }

    throw new KpiForbiddenError('Employees may only view their own KPI');
  }

  async assertCanScore(
    actor: ActorContext,
    assignment: KpiAssignmentContext,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === assignment.employeeId) return;

    await this.companyAccess.assertCompanyAccess(actor, assignment.companyId);
    const role = access?.businessRole ?? null;

    if (role === 'owner') return;

    if (role === 'big_leader') return;

    if (role === 'sub_leader') {
      if (assignment.reviewerId && access?.employeeId === assignment.reviewerId) return;
      await this.assertTeamMember(access?.employeeId ?? null, assignment.employeeId);
      return;
    }

    if (role === 'secretary') return;

    throw new KpiForbiddenError('You are not authorized to score this KPI assignment');
  }

  async assertCanReview(
    actor: ActorContext,
    assignment: KpiAssignmentContext,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    await this.companyAccess.assertCompanyAccess(actor, assignment.companyId);
    const role = access?.businessRole ?? null;

    if (role === 'owner' || role === 'big_leader') return;

    if (role === 'sub_leader') {
      if (assignment.reviewerId && access?.employeeId === assignment.reviewerId) return;
      await this.assertTeamMember(access?.employeeId ?? null, assignment.employeeId);
      return;
    }

    throw new KpiForbiddenError('Only reviewers may submit KPI reviews');
  }

  async assertCanSubmitOwn(
    actor: ActorContext,
    assignment: KpiAssignmentContext,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === assignment.employeeId) return;
    throw new KpiForbiddenError('Only the assigned employee may submit their KPI');
  }

  async assertCanFinalize(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new KpiForbiddenError('Only Owner or Secretary may finalize KPI assignments');
  }

  private async assertTeamMember(
    leaderEmployeeId: string | null,
    employeeId: string,
  ): Promise<void> {
    if (!leaderEmployeeId) {
      throw new KpiForbiddenError('Sub leader must be linked to an employee record');
    }
    const teamIds = await this.hierarchy.getDescendantEmployeeIds(leaderEmployeeId);
    const allowed = new Set([leaderEmployeeId, ...teamIds]);
    if (!allowed.has(employeeId)) {
      throw new KpiForbiddenError('Sub leaders may only review KPI for their team');
    }
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }
}
