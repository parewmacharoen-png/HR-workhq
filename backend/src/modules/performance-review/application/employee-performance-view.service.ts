import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { KpiAssignmentService } from '../../kpi/application/kpi-assignment.service';
import { KpiTemplateService } from '../../kpi/application/kpi-template.service';
import { PerformanceService } from '../../performance/application/performance.service';
import { resolveProbationStatus } from '../../employee/domain/services/employee-date-events.service';
import { PerformanceReviewService } from './performance-review.service';
import type {
  EmployeePerformanceImprovementItemDto,
  EmployeePerformanceViewDto,
} from './dto/employee-performance-view.dto';
import type { KpiAssignmentResponse } from '../../kpi/application/dto/kpi.dto';
import type { PerformanceReviewResponse } from './dto/performance-review.dto';
import type { ProbationReviewResponse } from '../../performance/application/dto/performance.dto';

const ACTIVE_KPI_STATUSES = new Set(['pending', 'in_progress', 'submitted', 'reviewed']);

function pickActiveAssignment(assignments: KpiAssignmentResponse[]): KpiAssignmentResponse | null {
  return assignments.find((row) => ACTIVE_KPI_STATUSES.has(row.status)) ?? assignments[0] ?? null;
}

function resolveNextReviewDue(
  reviews: PerformanceReviewResponse[],
  probations: ProbationReviewResponse[],
  cycleEndById: Map<string, string>,
): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const candidates: string[] = [];

  for (const review of reviews) {
    if (['finalized', 'cancelled'].includes(review.status)) continue;
    const due = cycleEndById.get(review.cycleId);
    if (due && due >= today) candidates.push(due);
  }

  for (const probation of probations) {
    if (probation.outcome !== 'pending') continue;
    const due = probation.probationEndDate.slice(0, 10);
    if (due >= today) candidates.push(due);
  }

  candidates.sort();
  return candidates[0] ?? null;
}

function buildImprovementItems(
  probations: ProbationReviewResponse[],
  activeAssignment: KpiAssignmentResponse | null,
  reviews: PerformanceReviewResponse[],
): EmployeePerformanceImprovementItemDto[] {
  const items: EmployeePerformanceImprovementItemDto[] = [];

  for (const probation of probations) {
    const needsAttention = probation.outcome === 'pending'
      || probation.outcome === 'extended'
      || probation.outcome === 'failed';
    if (!needsAttention && !probation.notes) continue;
    items.push({
      id: probation.id,
      type: 'probation',
      title: probation.outcome === 'pending'
        ? 'ทดลองงานรอผลประเมิน'
        : probation.outcome === 'extended'
          ? 'ขยายทดลองงาน'
          : probation.outcome === 'failed'
            ? 'ไม่ผ่านทดลองงาน'
            : 'บันทึกทดลองงาน',
      description: probation.notes,
      date: probation.reviewedAt ?? probation.createdAt,
    });
  }

  const reviewerComment = activeAssignment?.score?.reviewerComment;
  if (reviewerComment) {
    items.push({
      id: `kpi-comment-${activeAssignment!.id}`,
      type: 'kpi_review',
      title: 'หมายเหตุจากผู้ประเมิน KPI',
      description: reviewerComment,
      date: activeAssignment?.score?.finalizedAt ?? null,
    });
  }

  const latestReview = reviews[0];
  if (latestReview?.leaderComment) {
    items.push({
      id: `review-comment-${latestReview.id}`,
      type: 'review_comment',
      title: 'ข้อเสนอแนะจากผู้ประเมิน',
      description: latestReview.leaderComment,
      date: latestReview.finalizedAt ?? latestReview.updatedAt,
    });
  }

  return items;
}

@Injectable()
export class EmployeePerformanceViewService {
  constructor(
    private readonly kpiAssignments: KpiAssignmentService,
    private readonly kpiTemplates: KpiTemplateService,
    private readonly performanceReviews: PerformanceReviewService,
    private readonly performance: PerformanceService,
    private readonly prisma: PrismaService,
  ) {}

  async getEmployeePerformanceView(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeePerformanceViewDto> {
    const [kpiData, reviewData, probations] = await Promise.all([
      this.kpiAssignments.getEmployeeKpi(actor, employeeId, companyId),
      this.performanceReviews.getEmployeeReviews(actor, employeeId, companyId),
      this.performance.listProbationsForEmployee(actor, employeeId),
    ]);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { employmentStatus: true },
    });

    const reviews = reviewData.reviews;
    const assignments = kpiData.assignments;
    const latestReview = reviews[0] ?? null;
    const activeAssignment = pickActiveAssignment(assignments);
    const latestKpiAssignment = assignments[0] ?? null;

    let targetByMetricId = new Map<string, string | null>();
    if (activeAssignment) {
      const template = await this.kpiTemplates.getOrThrow(activeAssignment.templateId);
      targetByMetricId = new Map(template.metrics.map((metric) => [metric.id, metric.targetValue]));
    }

    const currentGoals = (activeAssignment?.score?.items ?? []).map((item) => ({
      id: item.metricId,
      name: item.metricName,
      target: targetByMetricId.get(item.metricId) ?? null,
      actual: item.rawValue,
      progress: item.score,
      weight: item.weight,
      status: activeAssignment!.status,
    }));

    const goalsCompleted = currentGoals.filter((goal) => goal.progress != null).length;
    const goalsPending = currentGoals.filter((goal) => goal.progress == null).length;

    const reviewerIds = [...new Set(reviews.map((row) => row.reviewerId).filter(Boolean))] as string[];
    const pendingCycleIds = [...new Set(
      reviews
        .filter((row) => !['finalized', 'cancelled'].includes(row.status))
        .map((row) => row.cycleId),
    )];
    const [reviewerRows, pendingCycles] = await Promise.all([
      reviewerIds.length
        ? this.prisma.employee.findMany({
            where: { id: { in: reviewerIds }, deletedAt: null },
            select: { id: true, firstName: true, lastName: true },
          })
        : Promise.resolve([]),
      pendingCycleIds.length
        ? this.prisma.performanceReviewCycle.findMany({
            where: { id: { in: pendingCycleIds }, deletedAt: null },
            select: { id: true, periodEnd: true },
          })
        : Promise.resolve([]),
    ]);
    const reviewerNameById = new Map(
      reviewerRows.map((row) => [row.id, `${row.firstName} ${row.lastName}`.trim()]),
    );
    const cycleEndById = new Map(
      pendingCycles.map((row) => [row.id, row.periodEnd.toISOString().slice(0, 10)]),
    );

    const reviewHistory = reviews.map((row) => ({
      id: row.id,
      cycleId: row.cycleId,
      period: row.cycleName,
      reviewType: 'performance_review' as const,
      kpiScore: row.kpiScore,
      reviewScore: row.finalScore,
      status: row.status,
      reviewerName: row.reviewerId ? reviewerNameById.get(row.reviewerId) ?? null : null,
      completedDate: row.finalizedAt,
    }));

    const probation = resolveProbationStatus(employee?.employmentStatus ?? '');
    const improvementItems = buildImprovementItems(probations, activeAssignment, reviews);

    return {
      summary: {
        currentKpiScore: latestKpiAssignment?.score?.totalScore
          ?? activeAssignment?.score?.totalScore
          ?? null,
        latestReviewScore: latestReview?.finalScore ?? null,
        latestReviewPeriod: latestReview?.cycleName ?? null,
        reviewStatus: latestReview?.status ?? null,
        probationStatus: probation.label,
        probationStatusCode: probation.code,
        nextReviewDue: resolveNextReviewDue(reviews, probations, cycleEndById),
        goalsCompleted,
        goalsPending,
        warningsCount: improvementItems.length,
      },
      currentGoals,
      reviewHistory,
      improvementItems,
    };
  }
}
