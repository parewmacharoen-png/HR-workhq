// ============================================================================
// modules/kpi/application/kpi-position-rule.service.ts
// Platform Consolidation PART A — KPI position assignment rules
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { NotFoundError } from '../../../shared/kernel/domain-error';
import { KpiAccessService } from './kpi-access.service';
import {
  CreateKpiPositionRuleDto,
  KpiPositionRuleResponse,
  KpiPositionRulesDashboard,
  KpiTemplateResponse,
  UpdateKpiPositionRuleDto,
} from './dto/kpi.dto';
import { KpiTemplateService } from './kpi-template.service';

class KpiPositionRuleNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`KPI position rule ${id} not found`);
  }
}

@Injectable()
export class KpiPositionRuleService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: KpiAccessService,
    private readonly audit: AuditService,
    private readonly templates: KpiTemplateService,
  ) {}

  async create(actor: ActorContext, dto: CreateKpiPositionRuleDto): Promise<KpiPositionRuleResponse> {
    const companyId = dto.companyId ?? null;
    if (companyId) {
      await this.access.assertCanManageTemplates(actor, companyId);
    } else {
      await this.access.assertCanManageTemplates(actor, await this.resolveTemplateCompany(dto.kpiTemplateId));
    }

    const row = await this.prisma.kpiPositionAssignmentRule.create({
      data: {
        companyId,
        positionDefinitionId: dto.positionDefinitionId,
        kpiTemplateId: dto.kpiTemplateId,
        priority: dto.priority ?? 0,
        active: dto.active ?? true,
        createdBy: actor.userId,
      },
      include: this.ruleInclude(),
    });

    await this.audit.record(actor, {
      entityType: 'kpi_position_rule',
      entityId: row.id,
      action: 'created',
    });

    return this.toResponse(row);
  }

  async list(actor: ActorContext, companyId: string): Promise<KpiPositionRuleResponse[]> {
    await this.access.assertCanViewTemplates(actor, companyId);

    const rows = await this.prisma.kpiPositionAssignmentRule.findMany({
      where: {
        OR: [{ companyId }, { companyId: null }],
      },
      include: this.ruleInclude(),
      orderBy: [{ priority: 'desc' }, { updatedAt: 'desc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateKpiPositionRuleDto,
  ): Promise<KpiPositionRuleResponse> {
    const existing = await this.getOrThrow(id);
    const companyId = dto.companyId !== undefined ? dto.companyId : existing.companyId;
    if (companyId) {
      await this.access.assertCanManageTemplates(actor, companyId);
    } else {
      await this.access.assertCanManageTemplates(
        actor,
        await this.resolveTemplateCompany(dto.kpiTemplateId ?? existing.kpiTemplateId),
      );
    }

    const row = await this.prisma.kpiPositionAssignmentRule.update({
      where: { id },
      data: {
        companyId: dto.companyId !== undefined ? dto.companyId : undefined,
        positionDefinitionId: dto.positionDefinitionId ?? undefined,
        kpiTemplateId: dto.kpiTemplateId ?? undefined,
        priority: dto.priority ?? undefined,
        active: dto.active ?? undefined,
      },
      include: this.ruleInclude(),
    });

    await this.audit.record(actor, {
      entityType: 'kpi_position_rule',
      entityId: id,
      action: 'updated',
    });

    return this.toResponse(row);
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    if (existing.companyId) {
      await this.access.assertCanManageTemplates(actor, existing.companyId);
    } else {
      await this.access.assertCanManageTemplates(
        actor,
        await this.resolveTemplateCompany(existing.kpiTemplateId),
      );
    }

    await this.prisma.kpiPositionAssignmentRule.delete({ where: { id } });

    await this.audit.record(actor, {
      entityType: 'kpi_position_rule',
      entityId: id,
      action: 'deleted',
    });
  }

  async resolveTemplateForEmployee(
    employeeId: string,
    companyId: string,
  ): Promise<KpiTemplateResponse | null> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { positionDefinitionId: true },
    });
    if (!employee?.positionDefinitionId) {
      return this.resolveManualAssignment(employeeId, companyId);
    }

    const rules = await this.prisma.kpiPositionAssignmentRule.findMany({
      where: {
        positionDefinitionId: employee.positionDefinitionId,
        active: true,
        OR: [{ companyId }, { companyId: null }],
      },
      orderBy: [{ companyId: 'desc' }, { priority: 'desc' }],
    });

    const rule = rules.find((row) => row.companyId === companyId)
      ?? rules.find((row) => row.companyId === null);

    if (rule) {
      return this.templates.toResponse(await this.templates.getOrThrow(rule.kpiTemplateId));
    }

    return this.resolveManualAssignment(employeeId, companyId);
  }

  async getPositionRulesDashboard(
    actor: ActorContext,
    companyId: string,
  ): Promise<KpiPositionRulesDashboard> {
    const rules = await this.list(actor, companyId);
    const activeRules = rules.filter((rule) => rule.active);

    const employeesWithPosition = await this.prisma.employee.count({
      where: {
        deletedAt: null,
        positionDefinitionId: { not: null },
        employmentStatus: { not: 'terminated' },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
    });

    const positionIds = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        positionDefinitionId: { not: null },
        employmentStatus: { not: 'terminated' },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: { positionDefinitionId: true },
      distinct: ['positionDefinitionId'],
    });

    const coveredPositionIds = new Set(
      activeRules
        .filter((rule) => rule.companyId === companyId || rule.companyId === null)
        .map((rule) => rule.positionDefinitionId),
    );

    const uncoveredPositions = positionIds.filter(
      (row) => row.positionDefinitionId && !coveredPositionIds.has(row.positionDefinitionId),
    );

    const employeesWithoutMatchingRule = uncoveredPositions.length > 0
      ? await this.prisma.employee.count({
          where: {
            deletedAt: null,
            positionDefinitionId: { in: uncoveredPositions.map((row) => row.positionDefinitionId!) },
            employmentStatus: { not: 'terminated' },
            assignments: {
              some: { companyId, effectiveTo: null, deletedAt: null },
            },
          },
        })
      : 0;

    return {
      companyId,
      activeRuleCount: activeRules.length,
      totalRuleCount: rules.length,
      employeesWithPosition,
      employeesWithoutMatchingRule,
      rules: activeRules.slice(0, 20),
    };
  }

  private async resolveManualAssignment(
    employeeId: string,
    companyId: string,
  ): Promise<KpiTemplateResponse | null> {
    const assignment = await this.prisma.kpiAssignment.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        cycle: { companyId, deletedAt: null, status: { in: ['active', 'scoring'] } },
      },
      orderBy: { createdAt: 'desc' },
      select: { templateId: true },
    });

    if (!assignment) return null;
    return this.templates.toResponse(await this.templates.getOrThrow(assignment.templateId));
  }

  private async getOrThrow(id: string) {
    const row = await this.prisma.kpiPositionAssignmentRule.findUnique({
      where: { id },
      include: this.ruleInclude(),
    });
    if (!row) throw new KpiPositionRuleNotFoundError(id);
    return row;
  }

  private async resolveTemplateCompany(templateId: string): Promise<string> {
    const template = await this.templates.getOrThrow(templateId);
    if (!template.companyId) {
      throw new NotFoundError(`Template ${templateId} has no company scope`);
    }
    return template.companyId;
  }

  private ruleInclude() {
    return {
      positionDefinition: { select: { name: true } },
      kpiTemplate: { select: { name: true } },
    } as const;
  }

  private toResponse(row: {
    id: string;
    companyId: string | null;
    positionDefinitionId: string;
    kpiTemplateId: string;
    priority: number;
    active: boolean;
    createdAt: Date;
    updatedAt: Date;
    positionDefinition: { name: string };
    kpiTemplate: { name: string };
  }): KpiPositionRuleResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      positionDefinitionId: row.positionDefinitionId,
      positionDefinitionName: row.positionDefinition.name,
      kpiTemplateId: row.kpiTemplateId,
      kpiTemplateName: row.kpiTemplate.name,
      priority: row.priority,
      active: row.active,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
