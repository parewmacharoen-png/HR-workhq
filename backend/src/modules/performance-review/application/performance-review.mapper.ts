// ============================================================================
// modules/performance-review/application/performance-review.mapper.ts
// KPI-003
// ============================================================================

import { Prisma } from '@prisma/client';
import {
  PerformanceReview360FeedbackResponse,
  PerformanceReviewResponse,
} from './dto/performance-review.dto';

export const PERFORMANCE_REVIEW_INCLUDE = {
  cycle: { include: { weightProfile: true } },
  employee: { select: { id: true, globalId: true, firstName: true, lastName: true } },
  feedback360: { orderBy: { createdAt: 'asc' as const } },
} satisfies Prisma.PerformanceReviewInclude;

export type PerformanceReviewRow = Prisma.PerformanceReviewGetPayload<{
  include: typeof PERFORMANCE_REVIEW_INCLUDE;
}>;

export function toPerformanceReviewResponse(review: PerformanceReviewRow): PerformanceReviewResponse {
  const employeeName = [review.employee.firstName, review.employee.lastName]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    id: review.id,
    cycleId: review.cycleId,
    cycleName: review.cycle.name,
    employeeId: review.employeeId,
    employeeCode: review.employee.globalId,
    employeeName,
    kpiAssignmentId: review.kpiAssignmentId,
    reviewerId: review.reviewerId,
    status: review.status,
    kpiScore: review.kpiScore != null ? Number(review.kpiScore) : null,
    leaderReviewScore: review.leaderReviewScore != null ? Number(review.leaderReviewScore) : null,
    selfReviewScore: review.selfReviewScore != null ? Number(review.selfReviewScore) : null,
    feedback360Score: review.feedback360Score != null ? Number(review.feedback360Score) : null,
    finalScore: review.finalScore != null ? Number(review.finalScore) : null,
    grade: review.grade,
    leaderComment: review.leaderComment,
    selfComment: review.selfComment,
    finalizedAt: review.finalizedAt?.toISOString() ?? null,
    feedback360: review.feedback360.map((item): PerformanceReview360FeedbackResponse => ({
      id: item.id,
      reviewerId: item.reviewerId,
      score: Number(item.score),
      comment: item.comment,
      createdAt: item.createdAt.toISOString(),
    })),
    createdAt: review.createdAt.toISOString(),
    updatedAt: review.updatedAt.toISOString(),
  };
}
