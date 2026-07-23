// ============================================================================
// modules/salary-review/application/compensation-dashboard.service.ts
// SAL-001 — dashboard + employee timeline
// ============================================================================

import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { CompensationReviewAccessService } from './compensation-review-access.service';
import { SalaryReviewService } from './salary-review.service';
import { PromotionReviewService } from './promotion-review.service';
import {
  CompensationDashboardResponse,
  CompensationTimelineResponse,
  PromotionReviewResponse,
} from './dto/salary-review.dto';

@Injectable()
export class CompensationDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: CompensationReviewAccessService,
    private readonly salaryReviews: SalaryReviewService,
    private readonly promotionReviews: PromotionReviewService,
    private readonly salaryVisibility: SalaryVisibilityService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async getDashboard(actor: ActorContext, companyId: string): Promise<CompensationDashboardResponse> {
    await this.access.assertCanViewDashboard(actor, companyId);

    const pendingSalary = await this.salaryReviews.list(actor, companyId, 'pending_approval');
    const pendingPromotion = await this.promotionReviews.list(actor, companyId, 'pending_approval');
    const approvedSalary = await this.salaryReviews.list(actor, companyId, 'approved');
    const approvedPromotion = await this.promotionReviews.list(actor, companyId, 'approved');

    const today = new Date().toISOString().slice(0, 10);
    const upcomingSalaryChanges = approvedSalary.filter((row) => row.effectiveDate >= today);
    const upcomingPromotionChanges = approvedPromotion.filter((row) => row.effectiveDate >= today);
    const promotionsOutsideCareerPath = await this.countPromotionsOutsideCareerPath(actor, companyId, pendingPromotion);

    return {
      companyId,
      pendingSalaryReviews: pendingSalary,
      pendingPromotionReviews: pendingPromotion,
      upcomingSalaryChanges,
      upcomingPromotionChanges,
      promotionsOutsideCareerPath,
    };
  }

  private async countPromotionsOutsideCareerPath(
    actor: ActorContext,
    companyId: string,
    pending: PromotionReviewResponse[],
  ): Promise<number> {
    let count = 0;
    for (const review of pending) {
      const validation = await this.promotionReviews.getPathValidation(actor, review.id);
      if (validation && !validation.valid) count += 1;
    }
    return count;
  }

  async getTimeline(
    actor: ActorContext,
    employeeId: string,
    companyId?: string,
  ): Promise<CompensationTimelineResponse> {
    const resolvedCompanyId = companyId ?? await this.resolveCompanyId(employeeId);
    await this.access.assertCanViewTimeline(actor, employeeId, resolvedCompanyId);

    const isSelf = await this.isSelf(actor, employeeId);
    if (isSelf) {
      await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);
    }

    const salaryHistory = await this.prisma.salaryHistory.findMany({
      where: {
        employeeId,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    const salaryRows = await this.salaryReviews.listForEmployee(employeeId, companyId);
    const promotionRows = await this.promotionReviews.listForEmployee(employeeId, companyId);

    const salaryReviews = await Promise.all(salaryRows.map((row) => this.salaryReviews.toResponse(row)));
    const promotionReviews = await Promise.all(promotionRows.map((row) => this.promotionReviews.toResponse(row)));

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { position: true, hireDate: true },
    });
    const currentSalary = salaryHistory.length > 0
      ? Number(salaryHistory[0].monthlySalary)
      : 0;

    const latestKpiScore = await this.loadLatestKpiScore(employeeId, companyId);

    return {
      employeeId,
      companyId: companyId ?? resolvedCompanyId,
      hireDate: employee?.hireDate.toISOString().slice(0, 10) ?? null,
      currentSalary,
      currentPosition: employee?.position ?? null,
      salaryHistory: salaryHistory.map((row) => ({
        id: row.id,
        monthlySalary: Number(row.monthlySalary),
        effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
        effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
        reason: row.reason,
      })),
      salaryReviews,
      promotionReviews,
      pendingSalaryReviews: salaryReviews.filter((row) =>
        row.status === 'draft' || row.status === 'pending_approval',
      ),
      pendingPromotionReviews: promotionReviews.filter((row) =>
        row.status === 'draft' || row.status === 'pending_approval',
      ),
      latestKpiScore,
    };
  }

  private async loadLatestKpiScore(
    employeeId: string,
    companyId?: string,
  ) {
    const score = await this.prisma.kpiScore.findFirst({
      where: {
        finalizedAt: { not: null },
        assignment: {
          employeeId,
          deletedAt: null,
          ...(companyId ? { cycle: { companyId } } : {}),
        },
      },
      orderBy: { finalizedAt: 'desc' },
      include: {
        assignment: {
          include: { cycle: true, template: true },
        },
      },
    });

    if (!score?.finalizedAt) return null;

    return {
      assignmentId: score.assignmentId,
      cycleName: score.assignment.cycle.name,
      templateName: score.assignment.template.name,
      totalScore: score.totalScore != null ? Number(score.totalScore) : null,
      grade: score.grade,
      finalizedAt: score.finalizedAt.toISOString(),
    };
  }

  private async resolveCompanyId(employeeId: string): Promise<string> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
      select: { companyId: true },
    });
    if (!assignment) {
      const any = await this.prisma.employeeAssignment.findFirst({
        where: { employeeId, effectiveTo: null, deletedAt: null },
        select: { companyId: true },
      });
      if (!any) throw new Error('Employee has no company assignment');
      return any.companyId;
    }
    return assignment.companyId;
  }

  private async isSelf(actor: ActorContext, employeeId: string): Promise<boolean> {
    const access = await this.permissions.findUserAccess(actor.userId);
    return access?.employeeId === employeeId;
  }
}
