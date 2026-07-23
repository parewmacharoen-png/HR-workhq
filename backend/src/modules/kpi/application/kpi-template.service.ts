// ============================================================================
// modules/kpi/application/kpi-template.service.ts
// KPI-001 / KPI-002
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { KpiTemplateNotFoundError } from '../domain/errors/kpi.errors';
import { KpiAccessService } from './kpi-access.service';
import { KpiTemplateBuilderService } from './kpi-template-builder.service';
import {
  CreateKpiTemplateDto,
  KpiTemplateResponse,
  UpdateKpiTemplateDto,
} from './dto/kpi.dto';
import { KpiDataSourceService } from './kpi-data-source.service';
import { toKpiTemplateResponse } from './kpi-template.mapper';

type TemplateRow = Prisma.KpiTemplateGetPayload<{
  include: { metrics: true };
}>;

@Injectable()
export class KpiTemplateService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly audit: AuditService,
    private readonly builder: KpiTemplateBuilderService,
    private readonly dataSource: KpiDataSourceService,
  ) {}

  async create(actor: ActorContext, dto: CreateKpiTemplateDto): Promise<KpiTemplateResponse> {
    await this.access.assertCanManageTemplates(actor, dto.companyId);

    const template = await this.prisma.kpiTemplate.create({
      data: {
        companyId: dto.companyId,
        positionDefinitionId: dto.positionDefinitionId ?? null,
        name: dto.name,
        description: dto.description ?? null,
        applicableRole: dto.applicableRole ?? null,
        applicableDepartment: dto.applicableDepartment ?? null,
        applicableTeamId: dto.applicableTeamId ?? null,
        status: 'draft',
        version: 1,
        rootId: null,
        sourceId: null,
        createdBy: actor.userId,
        metrics: {
          create: dto.metrics.map((metric, index) => this.metricCreateInput(metric, index)),
        },
      },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });

    await this.prisma.kpiTemplate.update({
      where: { id: template.id },
      data: { rootId: template.id },
    });

    await this.audit.record(actor, {
      entityType: 'kpi_template',
      entityId: template.id,
      action: 'created',
    });

    return this.toResponse({ ...template, rootId: template.id });
  }

  async list(actor: ActorContext, companyId: string): Promise<KpiTemplateResponse[]> {
    await this.access.assertCanViewTemplates(actor, companyId);

    const rows = await this.prisma.kpiTemplate.findMany({
      where: { companyId, deletedAt: null },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateKpiTemplateDto,
  ): Promise<KpiTemplateResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManageTemplates(actor, existing.companyId!);

    if (dto.metrics) {
      await this.prisma.kpiMetric.updateMany({
        where: { templateId: id, deletedAt: null },
        data: { deletedAt: new Date() },
      });
    }

    const template = await this.prisma.kpiTemplate.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        description: dto.description !== undefined ? dto.description : existing.description,
        positionDefinitionId: dto.positionDefinitionId !== undefined
          ? dto.positionDefinitionId
          : existing.positionDefinitionId,
        applicableRole: dto.applicableRole !== undefined ? dto.applicableRole : existing.applicableRole,
        applicableDepartment: dto.applicableDepartment !== undefined
          ? dto.applicableDepartment
          : existing.applicableDepartment,
        applicableTeamId: dto.applicableTeamId !== undefined
          ? dto.applicableTeamId
          : existing.applicableTeamId,
        status: dto.status ?? existing.status,
        ...(dto.metrics
          ? {
            metrics: {
              create: dto.metrics.map((metric, index) => this.metricCreateInput(metric, index)),
            },
          }
          : {}),
      },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'kpi_template',
      entityId: id,
      action: 'updated',
    });

    return this.toResponse(template);
  }

  clone(actor: ActorContext, id: string): Promise<KpiTemplateResponse> {
    return this.builder.cloneTemplate(actor, id);
  }

  archive(actor: ActorContext, id: string): Promise<KpiTemplateResponse> {
    return this.builder.archiveTemplate(actor, id);
  }

  delete(actor: ActorContext, id: string): Promise<void> {
    return this.builder.deleteTemplate(actor, id);
  }

  createVersion(actor: ActorContext, id: string): Promise<KpiTemplateResponse> {
    return this.builder.createTemplateVersion(actor, id);
  }

  findByPosition(
    actor: ActorContext,
    companyId: string,
    positionDefinitionId: string,
  ): Promise<KpiTemplateResponse[]> {
    return this.builder.findTemplatesByPosition(actor, companyId, positionDefinitionId);
  }

  async getOrThrow(id: string): Promise<TemplateRow> {
    const template = await this.prisma.kpiTemplate.findFirst({
      where: { id, deletedAt: null },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new KpiTemplateNotFoundError(id);
    return template;
  }

  toResponse(template: TemplateRow) {
    return toKpiTemplateResponse(template);
  }

  private metricCreateInput(
    metric: CreateKpiTemplateDto['metrics'][number],
    index: number,
  ): Prisma.KpiMetricCreateWithoutTemplateInput {
    const scoringMethod = this.dataSource.normalizeScoringMethod(metric.scoringMethod ?? 'manual');
    return {
      name: metric.name,
      description: metric.description ?? null,
      weight: decimal(metric.weight),
      targetType: metric.targetType,
      targetValue: metric.targetValue ?? null,
      scoringMethod,
      formulaExpression: metric.formulaExpression ?? null,
      systemSourceKey: metric.systemSourceKey ?? null,
      apiEndpoint: metric.apiEndpoint ?? null,
      apiFieldPath: metric.apiFieldPath ?? null,
      sortOrder: metric.sortOrder ?? index,
    };
  }
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
