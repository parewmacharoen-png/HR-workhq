// ============================================================================
// modules/performance-review/application/performance-review-access.service.ts
// KPI-003
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
import { PerformanceReviewForbiddenError } from '../domain/errors/performance-review.errors';

export interface PerformanceReviewContext {
  employeeId: string;
  reviewerId: string | null;
  companyId: string;
}

@Injectable()
export class PerformanceReviewAccessService {
  constructor(
    private readonly companyAccess: CompanyAccessService,
    private readonly hierarchy: HierarchyResolverService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assertCanManageProfiles(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new PerformanceReviewForbiddenError('Only Owner or Secretary may manage weight profiles');
  }

  async assertCanViewProfiles(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new PerformanceReviewForbiddenError();
  }

  async assertCanManageCycles(actor: ActorContext, companyId: string): Promise<void> {
    await this.assertCanManageProfiles(actor, companyId);
  }

  async assertCanViewDashboard(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;
    throw new PerformanceReviewForbiddenError();
  }

  async assertCanViewEmployeeReviews(
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

    throw new PerformanceReviewForbiddenError('Employees may only view their own performance reviews');
  }

  async assertCanUpdateScores(
    actor: ActorContext,
    review: PerformanceReviewContext,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === review.employeeId) return;

    await this.companyAccess.assertCompanyAccess(actor, review.companyId);
    const role = access?.businessRole ?? null;

    if (role === 'owner' || role === 'secretary' || role === 'big_leader') return;

    if (role === 'sub_leader') {
      if (review.reviewerId && access?.employeeId === review.reviewerId) return;
      await this.assertTeamMember(access?.employeeId ?? null, review.employeeId);
      return;
    }

    throw new PerformanceReviewForbiddenError('You are not authorized to update this review');
  }

  async assertCanSubmit(
    actor: ActorContext,
    review: PerformanceReviewContext,
  ): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === review.employeeId) return;

    await this.companyAccess.assertCompanyAccess(actor, review.companyId);
    const role = access?.businessRole ?? null;
    if (role === 'owner' || role === 'big_leader') return;

    if (role === 'sub_leader') {
      if (review.reviewerId && access?.employeeId === review.reviewerId) return;
      await this.assertTeamMember(access?.employeeId ?? null, review.employeeId);
      return;
    }

    throw new PerformanceReviewForbiddenError('Only reviewers may submit performance reviews');
  }

  async assertCanFinalize(actor: ActorContext, companyId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const role = await this.actorRole(actor.userId);
    if (role === 'owner' || role === 'secretary') return;
    throw new PerformanceReviewForbiddenError('Only Owner or Secretary may finalize performance reviews');
  }

  private async assertTeamMember(
    leaderEmployeeId: string | null,
    employeeId: string,
  ): Promise<void> {
    if (!leaderEmployeeId) {
      throw new PerformanceReviewForbiddenError('Sub leader must be linked to an employee record');
    }
    const teamIds = await this.hierarchy.getDescendantEmployeeIds(leaderEmployeeId);
    const allowed = new Set([leaderEmployeeId, ...teamIds]);
    if (!allowed.has(employeeId)) {
      throw new PerformanceReviewForbiddenError('Sub leaders may only review performance for their team');
    }
  }

  private async actorRole(userId: string): Promise<BusinessRoleCode | null> {
    const access = await this.permissions.findUserAccess(userId);
    return access?.businessRole ?? null;
  }
}
