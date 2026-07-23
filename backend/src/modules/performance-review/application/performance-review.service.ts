// ============================================================================
// modules/performance-review/application/performance-review.service.ts
// KPI-003
// ============================================================================

import { Inject, Injectable, Optional } from '@nestjs/common';
import { FormulaResolverService } from '../../formula-engine/application/formula-resolver.service';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import {
  PerformanceReviewInvalidStatusError,
  PerformanceReviewNotFoundError,
} from '../domain/errors/performance-review.errors';
import { PerformanceReviewAccessService } from './performance-review-access.service';
import { PerformanceScoreService } from './performance-score.service';
import { PerformanceReviewTelegramNotifier } from '../../telegram/application/performance-review.notifier';
import {
  AddPerformance360FeedbackDto,
  EmployeePerformanceReviewsResponse,
  PerformanceReviewResponse,
  UpdatePerformanceReviewScoresDto,
} from './dto/performance-review.dto';
import {
  PERFORMANCE_REVIEW_INCLUDE,
  PerformanceReviewRow,
  toPerformanceReviewResponse,
} from './performance-review.mapper';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';

@Injectable()
export class PerformanceReviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PerformanceReviewAccessService,
    private readonly scoring: PerformanceScoreService,
    private readonly audit: AuditService,
    private readonly notifier: PerformanceReviewTelegramNotifier,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
    @Optional() private readonly formulaResolver?: FormulaResolverService,
  ) {}

  async listByCycle(cycleId: string): Promise<PerformanceReviewResponse[]> {
    const rows = await this.prisma.performanceReview.findMany({
      where: { cycleId, deletedAt: null },
      include: PERFORMANCE_REVIEW_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => toPerformanceReviewResponse(row));
  }

  async getEmployeeReviews(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeePerformanceReviewsResponse> {
    await this.access.assertCanViewEmployeeReviews(actor, employeeId, companyId);

    const rows = await this.prisma.performanceReview.findMany({
      where: {
        employeeId,
        deletedAt: null,
        cycle: { companyId, deletedAt: null },
      },
      include: PERFORMANCE_REVIEW_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });

    return {
      employeeId,
      companyId,
      reviews: rows.map((row) => toPerformanceReviewResponse(row)),
    };
  }

  async updateScores(
    actor: ActorContext,
    reviewId: string,
    dto: UpdatePerformanceReviewScoresDto,
  ): Promise<PerformanceReviewResponse> {
    const review = await this.getOrThrow(reviewId);
    await this.access.assertCanUpdateScores(actor, this.reviewContext(review));

    if (review.status === 'finalized') {
      throw new PerformanceReviewInvalidStatusError('Finalized reviews cannot be edited');
    }

    const kpiScore = dto.kpiScore ?? (review.kpiScore != null ? Number(review.kpiScore) : null);
    const leaderReviewScore = dto.leaderReviewScore ?? (
      review.leaderReviewScore != null ? Number(review.leaderReviewScore) : null
    );
    const selfReviewScore = dto.selfReviewScore ?? (
      review.selfReviewScore != null ? Number(review.selfReviewScore) : null
    );
    let feedback360Score = dto.feedback360Score ?? (
      review.feedback360Score != null ? Number(review.feedback360Score) : null
    );

    if (dto.feedback360Score == null && review.feedback360.length > 0) {
      feedback360Score = this.average360(review.feedback360.map((item) => Number(item.score)));
    }

    const weights = review.cycle.weightProfile;
    const weightInputs = {
      kpiWeight: Number(weights.kpiWeight),
      leaderReviewWeight: Number(weights.leaderReviewWeight),
      selfReviewWeight: Number(weights.selfReviewWeight),
      feedback360Weight: Number(weights.feedback360Weight),
    };
    const finalScore = await this.resolveFinalScore(
      reviewId,
      review.cycle.companyId,
      actor.userId,
      { kpiScore, leaderReviewScore, selfReviewScore, feedback360Score },
      weightInputs,
    );
    const grade = finalScore != null ? this.scoring.mapGrade(finalScore) : null;
    const nextStatus = review.status === 'draft' ? 'in_progress' : review.status;

    const updated = await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        kpiScore: kpiScore != null ? decimal(kpiScore) : review.kpiScore,
        leaderReviewScore: leaderReviewScore != null ? decimal(leaderReviewScore) : review.leaderReviewScore,
        selfReviewScore: selfReviewScore != null ? decimal(selfReviewScore) : review.selfReviewScore,
        feedback360Score: feedback360Score != null ? decimal(feedback360Score) : review.feedback360Score,
        finalScore: finalScore != null ? decimal(finalScore) : null,
        grade,
        leaderComment: dto.leaderComment ?? review.leaderComment,
        selfComment: dto.selfComment ?? review.selfComment,
        status: nextStatus,
      },
      include: PERFORMANCE_REVIEW_INCLUDE,
    });

    await this.audit.record(actor, {
      entityType: 'performance_review',
      entityId: reviewId,
      action: 'scores_updated',
    });

    return toPerformanceReviewResponse(updated);
  }

  async add360Feedback(
    actor: ActorContext,
    reviewId: string,
    dto: AddPerformance360FeedbackDto,
  ): Promise<PerformanceReviewResponse> {
    const review = await this.getOrThrow(reviewId);
    await this.access.assertCanUpdateScores(actor, this.reviewContext(review));

    if (review.status === 'finalized') {
      throw new PerformanceReviewInvalidStatusError('Finalized reviews cannot receive 360 feedback');
    }

    await this.prisma.performanceReview360Feedback.upsert({
      where: {
        reviewId_reviewerId: { reviewId, reviewerId: dto.reviewerId },
      },
      create: {
        reviewId,
        reviewerId: dto.reviewerId,
        score: decimal(dto.score),
        comment: dto.comment ?? null,
      },
      update: {
        score: decimal(dto.score),
        comment: dto.comment ?? null,
      },
    });

    const refreshed = await this.getOrThrow(reviewId);
    const feedbackScores = refreshed.feedback360.map((item) => Number(item.score));
    const feedback360Score = this.average360(feedbackScores);

    const weights = refreshed.cycle.weightProfile;
    const weightInputs = {
      kpiWeight: Number(weights.kpiWeight),
      leaderReviewWeight: Number(weights.leaderReviewWeight),
      selfReviewWeight: Number(weights.selfReviewWeight),
      feedback360Weight: Number(weights.feedback360Weight),
    };
    const finalScore = await this.resolveFinalScore(
      reviewId,
      refreshed.cycle.companyId,
      actor.userId,
      {
        kpiScore: refreshed.kpiScore != null ? Number(refreshed.kpiScore) : null,
        leaderReviewScore: refreshed.leaderReviewScore != null
          ? Number(refreshed.leaderReviewScore)
          : null,
        selfReviewScore: refreshed.selfReviewScore != null ? Number(refreshed.selfReviewScore) : null,
        feedback360Score,
      },
      weightInputs,
    );

    const updated = await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        feedback360Score: feedback360Score != null ? decimal(feedback360Score) : null,
        finalScore: finalScore != null ? decimal(finalScore) : null,
        grade: finalScore != null ? this.scoring.mapGrade(finalScore) : null,
        status: refreshed.status === 'draft' ? 'in_progress' : refreshed.status,
      },
      include: PERFORMANCE_REVIEW_INCLUDE,
    });

    await this.audit.record(actor, {
      entityType: 'performance_review',
      entityId: reviewId,
      action: '360_feedback_added',
    });

    return toPerformanceReviewResponse(updated);
  }

  async submit(actor: ActorContext, reviewId: string): Promise<PerformanceReviewResponse> {
    const review = await this.getOrThrow(reviewId);
    const access = await this.permissions.findUserAccess(actor.userId);
    const isEmployee = access?.employeeId === review.employeeId;

    if (isEmployee) {
      if (!['draft', 'in_progress'].includes(review.status)) {
        throw new PerformanceReviewInvalidStatusError('Review cannot be submitted in its current status');
      }
    } else {
      await this.access.assertCanSubmit(actor, this.reviewContext(review));
      if (!['submitted', 'in_progress'].includes(review.status)) {
        throw new PerformanceReviewInvalidStatusError('Review is not ready for review submission');
      }
    }

    const updated = await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: { status: isEmployee ? 'submitted' : 'reviewed' },
      include: PERFORMANCE_REVIEW_INCLUDE,
    });

    await this.audit.record(actor, {
      entityType: 'performance_review',
      entityId: reviewId,
      action: isEmployee ? 'submitted' : 'reviewed',
    });

    return toPerformanceReviewResponse(updated);
  }

  async finalize(actor: ActorContext, reviewId: string): Promise<PerformanceReviewResponse> {
    const review = await this.getOrThrow(reviewId);
    await this.access.assertCanFinalize(actor, review.cycle.companyId);

    if (!['submitted', 'reviewed', 'in_progress'].includes(review.status)) {
      throw new PerformanceReviewInvalidStatusError('Review cannot be finalized in its current status');
    }

    const updated = await this.prisma.performanceReview.update({
      where: { id: reviewId },
      data: {
        status: 'finalized',
        finalizedAt: new Date(),
      },
      include: PERFORMANCE_REVIEW_INCLUDE,
    });

    await this.audit.record(actor, {
      entityType: 'performance_review',
      entityId: reviewId,
      action: 'finalized',
    });

    const response = toPerformanceReviewResponse(updated);
    await this.notifier.notifyReviewFinalized(response);
    return response;
  }

  async getOrThrow(id: string): Promise<PerformanceReviewRow> {
    const review = await this.prisma.performanceReview.findFirst({
      where: { id, deletedAt: null },
      include: PERFORMANCE_REVIEW_INCLUDE,
    });
    if (!review) throw new PerformanceReviewNotFoundError(id);
    return review;
  }

  toResponse(review: PerformanceReviewRow): PerformanceReviewResponse {
    return toPerformanceReviewResponse(review);
  }

  private reviewContext(review: PerformanceReviewRow) {
    return {
      employeeId: review.employeeId,
      reviewerId: review.reviewerId,
      companyId: review.cycle.companyId,
    };
  }

  private average360(scores: number[]): number | null {
    if (!scores.length) return null;
    const total = scores.reduce((sum, score) => sum + score, 0);
    return Math.round((total / scores.length) * 100) / 100;
  }

  private async resolveFinalScore(
    reviewId: string,
    companyId: string,
    userId: string,
    scores: {
      kpiScore?: number | null;
      leaderReviewScore?: number | null;
      selfReviewScore?: number | null;
      feedback360Score?: number | null;
    },
    weights: {
      kpiWeight: number;
      leaderReviewWeight: number;
      selfReviewWeight: number;
      feedback360Weight: number;
    },
  ): Promise<number | null> {
    const fallback = this.scoring.computeFinalScore(scores, weights);
    if (fallback == null || !this.formulaResolver) return fallback;

    const totalWeight = [weights.kpiWeight, weights.leaderReviewWeight, weights.selfReviewWeight, weights.feedback360Weight]
      .filter((w) => w > 0)
      .reduce((s, w) => s + w, 0);

    const resolved = await this.formulaResolver.resolveWithFallback(
      'kpi.weighted_score',
      {
        companyId,
        entityType: 'PerformanceReview',
        entityId: reviewId,
        inputs: {
          kpiScore: scores.kpiScore ?? 0,
          leaderScore: scores.leaderReviewScore ?? 0,
          selfScore: scores.selfReviewScore ?? 0,
          feedback360Score: scores.feedback360Score ?? 0,
          kpiWeight: weights.kpiWeight,
          leaderWeight: weights.leaderReviewWeight,
          selfWeight: weights.selfReviewWeight,
          feedback360Weight: weights.feedback360Weight,
          totalWeight,
        },
        executedBy: userId,
      },
      () => fallback,
    );
    return resolved.value;
  }
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
