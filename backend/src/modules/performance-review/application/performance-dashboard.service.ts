// ============================================================================
// modules/performance-review/application/performance-dashboard.service.ts
// KPI-003
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { PerformanceReviewAccessService } from './performance-review-access.service';
import { PerformanceReviewCycleService } from './performance-review-cycle.service';
import { PerformanceDashboardResponse } from './dto/performance-review.dto';
import {
  PERFORMANCE_REVIEW_INCLUDE,
  toPerformanceReviewResponse,
} from './performance-review.mapper';

@Injectable()
export class PerformanceDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PerformanceReviewAccessService,
    private readonly cycles: PerformanceReviewCycleService,
  ) {}

  async getDashboard(actor: ActorContext, companyId: string): Promise<PerformanceDashboardResponse> {
    await this.access.assertCanViewDashboard(actor, companyId);

    const activeCycles = (await this.cycles.list(actor, companyId))
      .filter((cycle) => cycle.status === 'active' || cycle.status === 'scoring');

    const baseWhere = {
      deletedAt: null as null,
      cycle: { companyId, deletedAt: null as null },
    };

    const [pendingRows, submittedRows, finalizedRows] = await Promise.all([
      this.prisma.performanceReview.findMany({
        where: { ...baseWhere, status: { in: ['draft', 'in_progress'] } },
        include: PERFORMANCE_REVIEW_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.performanceReview.findMany({
        where: { ...baseWhere, status: { in: ['submitted', 'reviewed'] } },
        include: PERFORMANCE_REVIEW_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 50,
      }),
      this.prisma.performanceReview.findMany({
        where: { ...baseWhere, status: 'finalized' },
        include: PERFORMANCE_REVIEW_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        take: 20,
      }),
    ]);

    return {
      companyId,
      activeCycles,
      pendingReviews: pendingRows.map((row) => toPerformanceReviewResponse(row)),
      submittedReviews: submittedRows.map((row) => toPerformanceReviewResponse(row)),
      recentlyFinalized: finalizedRows.map((row) => toPerformanceReviewResponse(row)),
    };
  }
}
