// ============================================================================
// modules/kpi/application/kpi-assignment.service.ts
// KPI-001
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { KpiTelegramNotifier } from '../../telegram/application/kpi.notifier';
import {
  KpiAssignmentNotFoundError,
  KpiConflictError,
  KpiInvalidStatusError,
} from '../domain/errors/kpi.errors';
import { KpiAccessService } from './kpi-access.service';
import { KpiDataSourceService } from './kpi-data-source.service';
import { computeWeightedTotal, mapGrade } from './kpi-scoring.service';
import {
  AssignKpiCycleDto,
  EmployeeKpiResponse,
  KpiAssignmentResponse,
  UpdateKpiScoresDto,
} from './dto/kpi.dto';
import { KpiTemplateService } from './kpi-template.service';
import { KPI_ASSIGNMENT_INCLUDE } from './kpi-assignment.include';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';

type AssignmentRow = Prisma.KpiAssignmentGetPayload<{
  include: {
    cycle: true;
    template: true;
    employee: { select: { id: true; globalId: true; firstName: true; lastName: true } };
    score: { include: { items: { include: { metric: true } } } };
  };
}>;

@Injectable()
export class KpiAssignmentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly templates: KpiTemplateService,
    private readonly dataSource: KpiDataSourceService,
    private readonly audit: AuditService,
    private readonly notifier: KpiTelegramNotifier,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async assignMany(
    actor: ActorContext,
    cycle: { id: string; companyId: string; name: string; status: string },
    dto: AssignKpiCycleDto,
  ): Promise<KpiAssignmentResponse[]> {
    const template = await this.templates.getOrThrow(dto.templateId);
    if (template.companyId && template.companyId !== cycle.companyId) {
      throw new KpiInvalidStatusError('Template does not belong to this company');
    }
    if (template.status !== 'active') {
      throw new KpiInvalidStatusError('Only active templates can be assigned');
    }

    const created: KpiAssignmentResponse[] = [];

    for (const employeeId of dto.employeeIds) {
      const existing = await this.prisma.kpiAssignment.findFirst({
        where: {
          cycleId: cycle.id,
          employeeId,
          templateId: dto.templateId,
          deletedAt: null,
        },
      });
      if (existing) continue;

      const assignment = await this.prisma.kpiAssignment.create({
        data: {
          cycleId: cycle.id,
          employeeId,
          templateId: dto.templateId,
          reviewerId: dto.reviewerId ?? null,
          status: 'pending',
          createdBy: actor.userId,
          score: {
            create: {
              items: {
                create: template.metrics.map((metric) => ({
                  metricId: metric.id,
                })),
              },
            },
          },
        },
        include: this.assignmentInclude(),
      });

      await this.audit.record(actor, {
        entityType: 'kpi_assignment',
        entityId: assignment.id,
        action: 'assigned',
      });

      const response = this.toResponse(assignment);
      created.push(response);
      await this.notifier.notifyAssigned(response);
      if (dto.reviewerId) {
        await this.notifier.notifyScoreNeeded(response);
      }
    }

    if (created.length === 0 && dto.employeeIds.length > 0) {
      throw new KpiConflictError('All selected employees already have this template assigned');
    }

    if (cycle.status === 'draft') {
      await this.prisma.kpiCycle.update({
        where: { id: cycle.id },
        data: { status: 'active' },
      });
    }

    return created;
  }

  async listByCycle(cycleId: string): Promise<KpiAssignmentResponse[]> {
    const rows = await this.prisma.kpiAssignment.findMany({
      where: { cycleId, deletedAt: null },
      include: this.assignmentInclude(),
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((row) => this.toResponse(row));
  }

  async getEmployeeKpi(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeKpiResponse> {
    await this.access.assertCanViewEmployeeKpi(actor, employeeId, companyId);

    const rows = await this.prisma.kpiAssignment.findMany({
      where: {
        employeeId,
        deletedAt: null,
        cycle: { companyId, deletedAt: null },
      },
      include: this.assignmentInclude(),
      orderBy: { createdAt: 'desc' },
    });

    return {
      employeeId,
      companyId,
      assignments: rows.map((row) => this.toResponse(row)),
    };
  }

  async updateScores(
    actor: ActorContext,
    assignmentId: string,
    dto: UpdateKpiScoresDto,
  ): Promise<KpiAssignmentResponse> {
    const assignment = await this.getOrThrow(assignmentId);
    const ctx = this.assignmentContext(assignment);
    await this.access.assertCanScore(actor, ctx);

    if (assignment.status === 'finalized') {
      throw new KpiInvalidStatusError('Finalized KPI assignments cannot be edited');
    }

    const score = assignment.score;
    if (!score) throw new KpiInvalidStatusError('KPI score record is missing');

    const template = await this.templates.getOrThrow(assignment.templateId);
    const metricMap = new Map(template.metrics.map((m) => [m.id, m]));

    for (const item of dto.items) {
      const metric = metricMap.get(item.metricId);
      if (!metric) {
        throw new KpiInvalidStatusError(`Metric ${item.metricId} is not part of this template`);
      }

      let resolvedScore = item.score ?? null;
      let resolvedRawValue = item.rawValue ?? null;

      if (resolvedScore == null) {
        const auto = await this.dataSource.resolveMetricScore(metric, {
          employeeId: assignment.employeeId,
          companyId: assignment.cycle.companyId,
          assignmentId: assignment.id,
          periodStart: assignment.cycle.periodStart,
          periodEnd: assignment.cycle.periodEnd,
          target: parseOptionalNumber(metric.targetValue),
          actual: parseOptionalNumber(item.rawValue ?? metric.targetValue),
        });
        if (auto.score != null) resolvedScore = auto.score;
        if (auto.rawValue != null && resolvedRawValue == null) resolvedRawValue = auto.rawValue;
      }

      await this.prisma.kpiScoreItem.upsert({
        where: {
          scoreId_metricId: { scoreId: score.id, metricId: item.metricId },
        },
        create: {
          scoreId: score.id,
          metricId: item.metricId,
          rawValue: resolvedRawValue,
          score: resolvedScore != null ? decimal(resolvedScore) : null,
        },
        update: {
          rawValue: resolvedRawValue,
          score: resolvedScore != null ? decimal(resolvedScore) : null,
        },
      });
    }

    const items = await this.prisma.kpiScoreItem.findMany({
      where: { scoreId: score.id },
      include: { metric: true },
    });

    const scoredItems = items
      .filter((item) => item.score != null)
      .map((item) => ({
        score: Number(item.score),
        weight: Number(item.metric.weight),
      }));

    const totalScore = scoredItems.length ? computeWeightedTotal(scoredItems) : null;
    const grade = totalScore != null ? mapGrade(totalScore) : null;

    const nextStatus = assignment.status === 'pending' ? 'in_progress' : assignment.status;

    await this.prisma.kpiScore.update({
      where: { id: score.id },
      data: {
        totalScore: totalScore != null ? decimal(totalScore) : null,
        grade,
        employeeComment: dto.employeeComment ?? score.employeeComment,
        reviewerComment: dto.reviewerComment ?? score.reviewerComment,
      },
    });

    const updated = await this.prisma.kpiAssignment.update({
      where: { id: assignmentId },
      data: { status: nextStatus },
      include: this.assignmentInclude(),
    });

    await this.audit.record(actor, {
      entityType: 'kpi_assignment',
      entityId: assignmentId,
      action: 'scores_updated',
    });

    const response = this.toResponse(updated);
    if (dto.reviewerComment && assignment.reviewerId) {
      await this.notifier.notifyScoreNeeded(response);
    }

    return response;
  }

  async submit(actor: ActorContext, assignmentId: string): Promise<KpiAssignmentResponse> {
    const assignment = await this.getOrThrow(assignmentId);
    const ctx = this.assignmentContext(assignment);
    const access = await this.permissions.findUserAccess(actor.userId);
    const isEmployee = access?.employeeId === assignment.employeeId;

    if (isEmployee) {
      await this.access.assertCanSubmitOwn(actor, ctx);
      if (!['pending', 'in_progress'].includes(assignment.status)) {
        throw new KpiInvalidStatusError('Assignment cannot be submitted in its current status');
      }
    } else {
      await this.access.assertCanReview(actor, ctx);
      if (!['submitted', 'in_progress'].includes(assignment.status)) {
        throw new KpiInvalidStatusError('Assignment is not ready for review submission');
      }
    }

    const updated = await this.prisma.kpiAssignment.update({
      where: { id: assignmentId },
      data: { status: isEmployee ? 'submitted' : 'reviewed' },
      include: this.assignmentInclude(),
    });

    await this.audit.record(actor, {
      entityType: 'kpi_assignment',
      entityId: assignmentId,
      action: isEmployee ? 'submitted' : 'reviewed',
    });

    const response = this.toResponse(updated);
    if (isEmployee && assignment.reviewerId) {
      await this.notifier.notifyScoreNeeded(response);
    }

    return response;
  }

  async finalize(actor: ActorContext, assignmentId: string): Promise<KpiAssignmentResponse> {
    const assignment = await this.getOrThrow(assignmentId);
    await this.access.assertCanFinalize(actor, assignment.cycle.companyId);

    if (!['submitted', 'reviewed', 'in_progress'].includes(assignment.status)) {
      throw new KpiInvalidStatusError('Assignment cannot be finalized in its current status');
    }

    const updated = await this.prisma.kpiAssignment.update({
      where: { id: assignmentId },
      data: { status: 'finalized' },
      include: this.assignmentInclude(),
    });

    if (updated.score) {
      await this.prisma.kpiScore.update({
        where: { id: updated.score.id },
        data: { finalizedAt: new Date() },
      });
    }

    await this.audit.record(actor, {
      entityType: 'kpi_assignment',
      entityId: assignmentId,
      action: 'finalized',
    });

    const refreshed = await this.getOrThrow(assignmentId);
    const response = this.toResponse(refreshed);
    await this.notifier.notifyFinalized(response);
    return response;
  }

  async getOrThrow(id: string): Promise<AssignmentRow> {
    const assignment = await this.prisma.kpiAssignment.findFirst({
      where: { id, deletedAt: null },
      include: {
        ...this.assignmentInclude(),
        template: { include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } } },
      },
    });
    if (!assignment) throw new KpiAssignmentNotFoundError(id);
    return assignment;
  }

  toResponse(assignment: AssignmentRow): KpiAssignmentResponse {
    const employeeName = [assignment.employee.firstName, assignment.employee.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();

    return {
      id: assignment.id,
      cycleId: assignment.cycleId,
      cycleName: assignment.cycle.name,
      employeeId: assignment.employeeId,
      employeeCode: assignment.employee.globalId,
      employeeName,
      templateId: assignment.templateId,
      templateName: assignment.template.name,
      reviewerId: assignment.reviewerId,
      status: assignment.status,
      score: assignment.score
        ? {
          id: assignment.score.id,
          totalScore: assignment.score.totalScore != null ? Number(assignment.score.totalScore) : null,
          grade: assignment.score.grade,
          employeeComment: assignment.score.employeeComment,
          reviewerComment: assignment.score.reviewerComment,
          finalizedAt: assignment.score.finalizedAt?.toISOString() ?? null,
          items: assignment.score.items.map((item) => ({
            id: item.id,
            metricId: item.metricId,
            metricName: item.metric.name,
            rawValue: item.rawValue,
            score: item.score != null ? Number(item.score) : null,
            weight: Number(item.metric.weight),
          })),
        }
        : null,
      createdAt: assignment.createdAt.toISOString(),
    };
  }

  private assignmentContext(assignment: AssignmentRow) {
    return {
      employeeId: assignment.employeeId,
      reviewerId: assignment.reviewerId,
      companyId: assignment.cycle.companyId,
    };
  }

  private assignmentInclude() {
    return KPI_ASSIGNMENT_INCLUDE;
  }

}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function parseOptionalNumber(value: string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}
