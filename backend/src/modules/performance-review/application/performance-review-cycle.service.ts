// ============================================================================
// modules/performance-review/application/performance-review-cycle.service.ts
// KPI-003
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import {
  PerformanceReviewConflictError,
  PerformanceReviewCycleNotFoundError,
  PerformanceReviewInvalidStatusError,
} from '../domain/errors/performance-review.errors';
import { PerformanceReviewAccessService } from './performance-review-access.service';
import { PerformanceWeightProfileService } from './performance-weight-profile.service';
import { PerformanceReviewTelegramNotifier } from '../../telegram/application/performance-review.notifier';
import {
  AssignPerformanceReviewCycleDto,
  CreatePerformanceReviewCycleDto,
  PerformanceReviewCycleResponse,
  PerformanceReviewResponse,
} from './dto/performance-review.dto';
import {
  PERFORMANCE_REVIEW_INCLUDE,
  toPerformanceReviewResponse,
} from './performance-review.mapper';

@Injectable()
export class PerformanceReviewCycleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PerformanceReviewAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly weightProfiles: PerformanceWeightProfileService,
    private readonly audit: AuditService,
    private readonly notifier: PerformanceReviewTelegramNotifier,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePerformanceReviewCycleDto,
  ): Promise<PerformanceReviewCycleResponse> {
    await this.access.assertCanManageCycles(actor, dto.companyId);
    await this.weightProfiles.getOrThrow(dto.weightProfileId);

    const cycle = await this.prisma.performanceReviewCycle.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        weightProfileId: dto.weightProfileId,
        status: 'draft',
        createdBy: actor.userId,
      },
      include: {
        weightProfile: true,
        _count: { select: { reviews: true } },
      },
    });

    await this.audit.record(actor, {
      entityType: 'performance_review_cycle',
      entityId: cycle.id,
      action: 'created',
    });

    return this.toResponse(cycle);
  }

  async list(actor: ActorContext, companyId: string): Promise<PerformanceReviewCycleResponse[]> {
    await this.access.assertCanViewDashboard(actor, companyId);

    const rows = await this.prisma.performanceReviewCycle.findMany({
      where: { companyId, deletedAt: null },
      include: {
        weightProfile: true,
        _count: { select: { reviews: true } },
      },
      orderBy: { periodStart: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async assign(
    actor: ActorContext,
    cycleId: string,
    dto: AssignPerformanceReviewCycleDto,
  ): Promise<PerformanceReviewResponse[]> {
    const cycle = await this.getOrThrow(cycleId);
    await this.access.assertCanManageCycles(actor, cycle.companyId);

    if (cycle.status === 'finalized' || cycle.status === 'cancelled') {
      throw new PerformanceReviewInvalidStatusError(
        'Cannot assign employees to a finalized or cancelled cycle',
      );
    }

    for (const employeeId of dto.employeeIds) {
      await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);
    }

    const created: PerformanceReviewResponse[] = [];

    for (const employeeId of dto.employeeIds) {
      const existing = await this.prisma.performanceReview.findFirst({
        where: { cycleId, employeeId, deletedAt: null },
      });
      if (existing) continue;

      const kpiAssignment = await this.findLinkedKpiAssignment(
        employeeId,
        cycle.companyId,
        cycle.periodStart,
        cycle.periodEnd,
      );

      const kpiScore = kpiAssignment?.score?.totalScore != null
        ? Number(kpiAssignment.score.totalScore)
        : null;

      const review = await this.prisma.performanceReview.create({
        data: {
          cycleId,
          employeeId,
          reviewerId: dto.reviewerId ?? null,
          kpiAssignmentId: kpiAssignment?.id ?? null,
          kpiScore: kpiScore != null ? decimal(kpiScore) : null,
          status: 'draft',
          createdBy: actor.userId,
        },
        include: PERFORMANCE_REVIEW_INCLUDE,
      });

      await this.audit.record(actor, {
        entityType: 'performance_review',
        entityId: review.id,
        action: 'assigned',
      });

      const response = toPerformanceReviewResponse(review);
      created.push(response);
      await this.notifier.notifyReviewCreated(response);
    }

    if (created.length === 0 && dto.employeeIds.length > 0) {
      throw new PerformanceReviewConflictError(
        'All selected employees already have a review in this cycle',
      );
    }

    if (cycle.status === 'draft') {
      await this.prisma.performanceReviewCycle.update({
        where: { id: cycleId },
        data: { status: 'active' },
      });
    }

    return created;
  }

  async listReviews(actor: ActorContext, cycleId: string): Promise<PerformanceReviewResponse[]> {
    const cycle = await this.getOrThrow(cycleId);
    await this.access.assertCanViewDashboard(actor, cycle.companyId);

    const rows = await this.prisma.performanceReview.findMany({
      where: { cycleId, deletedAt: null },
      include: PERFORMANCE_REVIEW_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toPerformanceReviewResponse(row));
  }

  async getOrThrow(id: string) {
    const cycle = await this.prisma.performanceReviewCycle.findFirst({
      where: { id, deletedAt: null },
      include: {
        weightProfile: true,
        _count: { select: { reviews: true } },
      },
    });
    if (!cycle) throw new PerformanceReviewCycleNotFoundError(id);
    return cycle;
  }

  toResponse(cycle: {
    id: string;
    companyId: string;
    name: string;
    periodStart: Date;
    periodEnd: Date;
    weightProfileId: string;
    status: string;
    createdAt: Date;
    weightProfile: { name: string };
    _count: { reviews: number };
  }): PerformanceReviewCycleResponse {
    return {
      id: cycle.id,
      companyId: cycle.companyId,
      name: cycle.name,
      periodStart: cycle.periodStart.toISOString().slice(0, 10),
      periodEnd: cycle.periodEnd.toISOString().slice(0, 10),
      weightProfileId: cycle.weightProfileId,
      weightProfileName: cycle.weightProfile.name,
      status: cycle.status,
      reviewCount: cycle._count.reviews,
      createdAt: cycle.createdAt.toISOString(),
    };
  }

  private async findLinkedKpiAssignment(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ) {
    return this.prisma.kpiAssignment.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        cycle: {
          companyId,
          deletedAt: null,
          periodStart: { lte: periodEnd },
          periodEnd: { gte: periodStart },
        },
      },
      include: { score: true },
      orderBy: { updatedAt: 'desc' },
    });
  }
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
