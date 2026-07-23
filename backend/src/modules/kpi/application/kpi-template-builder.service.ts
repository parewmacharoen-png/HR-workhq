// ============================================================================
// modules/kpi/application/kpi-template-builder.service.ts
// KPI-002 — template clone, archive, versioning
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { KpiTemplateNotFoundError, KpiInvalidStatusError } from '../domain/errors/kpi.errors';
import { KpiAccessService } from './kpi-access.service';
import { KpiTemplateResponse } from './dto/kpi.dto';
import { toKpiTemplateResponse } from './kpi-template.mapper';

type TemplateRow = Prisma.KpiTemplateGetPayload<{ include: { metrics: true } }>;

@Injectable()
export class KpiTemplateBuilderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly audit: AuditService,
  ) {}

  async cloneTemplate(actor: ActorContext, id: string): Promise<KpiTemplateResponse> {
    const source = await this.getOrThrow(id);
    await this.access.assertCanManageTemplates(actor, source.companyId!);

    const rootId = source.rootId ?? source.id;
    const cloned = await this.prisma.kpiTemplate.create({
      data: {
        companyId: source.companyId,
        positionDefinitionId: source.positionDefinitionId,
        name: `${source.name} (Copy)`,
        description: source.description,
        applicableRole: source.applicableRole,
        applicableDepartment: source.applicableDepartment,
        applicableTeamId: source.applicableTeamId,
        status: 'draft',
        version: 1,
        rootId,
        sourceId: source.id,
        createdBy: actor.userId,
        metrics: {
          create: source.metrics.map((metric) => ({
            name: metric.name,
            description: metric.description,
            weight: metric.weight,
            targetType: metric.targetType,
            targetValue: metric.targetValue,
            scoringMethod: metric.scoringMethod,
            formulaExpression: metric.formulaExpression,
            systemSourceKey: metric.systemSourceKey,
            apiEndpoint: metric.apiEndpoint,
            apiFieldPath: metric.apiFieldPath,
            sortOrder: metric.sortOrder,
          })),
        },
      },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'kpi_template',
      entityId: cloned.id,
      action: 'cloned',
      after: { sourceId: id },
    });

    return toKpiTemplateResponse(cloned);
  }

  async archiveTemplate(actor: ActorContext, id: string): Promise<KpiTemplateResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManageTemplates(actor, existing.companyId!);

    const template = await this.prisma.kpiTemplate.update({
      where: { id },
      data: { status: 'archived' },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'kpi_template',
      entityId: id,
      action: 'archived',
    });

    return toKpiTemplateResponse(template);
  }

  async deleteTemplate(actor: ActorContext, id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManageTemplates(actor, existing.companyId!);

    if (existing.status === 'active') {
      throw new KpiInvalidStatusError('Active templates must be archived before deletion');
    }

    await this.prisma.kpiTemplate.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.userId },
    });

    await this.audit.record(actor, {
      entityType: 'kpi_template',
      entityId: id,
      action: 'deleted',
    });
  }

  async createTemplateVersion(actor: ActorContext, id: string): Promise<KpiTemplateResponse> {
    const source = await this.getOrThrow(id);
    await this.access.assertCanManageTemplates(actor, source.companyId!);

    const rootId = source.rootId ?? source.id;
    const latest = await this.prisma.kpiTemplate.findFirst({
      where: { rootId, deletedAt: null },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? source.version) + 1;

    await this.prisma.kpiTemplate.updateMany({
      where: { rootId, status: 'active', deletedAt: null },
      data: { status: 'archived' },
    });

    const versioned = await this.prisma.kpiTemplate.create({
      data: {
        companyId: source.companyId,
        positionDefinitionId: source.positionDefinitionId,
        name: source.name,
        description: source.description,
        applicableRole: source.applicableRole,
        applicableDepartment: source.applicableDepartment,
        applicableTeamId: source.applicableTeamId,
        status: 'draft',
        version: nextVersion,
        rootId,
        sourceId: source.id,
        createdBy: actor.userId,
        metrics: {
          create: source.metrics.map((metric) => ({
            name: metric.name,
            description: metric.description,
            weight: metric.weight,
            targetType: metric.targetType,
            targetValue: metric.targetValue,
            scoringMethod: metric.scoringMethod,
            formulaExpression: metric.formulaExpression,
            systemSourceKey: metric.systemSourceKey,
            apiEndpoint: metric.apiEndpoint,
            apiFieldPath: metric.apiFieldPath,
            sortOrder: metric.sortOrder,
          })),
        },
      },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'kpi_template',
      entityId: versioned.id,
      action: 'version_created',
      after: { sourceId: id, version: nextVersion },
    });

    return toKpiTemplateResponse(versioned);
  }

  async findTemplatesByPosition(
    actor: ActorContext,
    companyId: string,
    positionDefinitionId: string,
  ): Promise<KpiTemplateResponse[]> {
    await this.access.assertCanViewTemplates(actor, companyId);

    const rows = await this.prisma.kpiTemplate.findMany({
      where: {
        companyId,
        positionDefinitionId,
        deletedAt: null,
        status: { in: ['draft', 'active'] },
      },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
      orderBy: [{ version: 'desc' }, { updatedAt: 'desc' }],
    });

    return rows.map((row) => toKpiTemplateResponse(row));
  }

  private async getOrThrow(id: string): Promise<TemplateRow> {
    const template = await this.prisma.kpiTemplate.findFirst({
      where: { id, deletedAt: null },
      include: { metrics: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } } },
    });
    if (!template) throw new KpiTemplateNotFoundError(id);
    return template;
  }
}
