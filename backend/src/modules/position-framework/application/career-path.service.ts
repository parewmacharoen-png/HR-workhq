// ============================================================================
// modules/position-framework/application/career-path.service.ts
// KPI-004
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CareerPathNotFoundError } from '../domain/errors/position-framework.errors';
import { PositionFrameworkAccessService } from './position-framework-access.service';
import {
  buildArchiveData,
  buildCloneVersionFields,
  buildNewVersionFields,
  buildSoftDeleteData,
} from './framework-entity.util';
import {
  CareerPathResponse,
  CareerPathStepInputDto,
  CreateCareerPathDto,
  UpdateCareerPathDto,
} from './dto/position-framework.dto';

type CareerPathRow = Prisma.CareerPathGetPayload<{ include: { steps: true } }>;

@Injectable()
export class CareerPathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PositionFrameworkAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: ActorContext, dto: CreateCareerPathDto): Promise<CareerPathResponse> {
    await this.access.assertCanManage(actor, dto.companyId);

    const row = await this.prisma.careerPath.create({
      data: {
        companyId: dto.companyId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        status: 'draft',
        version: 1,
        createdBy: actor.userId,
        ...(dto.steps?.length
          ? { steps: { create: this.mapSteps(dto.steps) } }
          : {}),
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'career_path',
      entityId: row.id,
      action: 'created',
    });

    return this.toResponse(row);
  }

  async list(actor: ActorContext, companyId: string): Promise<CareerPathResponse[]> {
    await this.access.assertCanView(actor, companyId);

    const rows = await this.prisma.careerPath.findMany({
      where: { companyId, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdateCareerPathDto,
  ): Promise<CareerPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    if (dto.steps) {
      await this.prisma.careerPathStep.deleteMany({ where: { careerPathId: id } });
    }

    const row = await this.prisma.careerPath.update({
      where: { id },
      data: {
        code: dto.code ?? existing.code,
        name: dto.name ?? existing.name,
        description: dto.description !== undefined ? dto.description : existing.description,
        status: dto.status ?? existing.status,
        ...(dto.steps
          ? { steps: { create: this.mapSteps(dto.steps) } }
          : {}),
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'career_path',
      entityId: id,
      action: 'updated',
    });

    return this.toResponse(row);
  }

  async softDelete(actor: ActorContext, id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    await this.prisma.careerPath.update({
      where: { id },
      data: buildSoftDeleteData(actor.userId),
    });

    await this.audit.record(actor, {
      entityType: 'career_path',
      entityId: id,
      action: 'deleted',
    });
  }

  async archive(actor: ActorContext, id: string): Promise<CareerPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const row = await this.prisma.careerPath.update({
      where: { id },
      data: buildArchiveData(),
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'career_path',
      entityId: id,
      action: 'archived',
    });

    return this.toResponse(row);
  }

  async clone(actor: ActorContext, id: string): Promise<CareerPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const versionFields = buildCloneVersionFields(existing);
    const row = await this.prisma.careerPath.create({
      data: {
        companyId: existing.companyId,
        code: `${existing.code}-copy`,
        name: `${existing.name} (Copy)`,
        description: existing.description,
        ...versionFields,
        createdBy: actor.userId,
        steps: {
          create: existing.steps.map((step) => ({
            positionDefinitionId: step.positionDefinitionId,
            stepOrder: step.stepOrder,
            notes: step.notes,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'career_path',
      entityId: row.id,
      action: 'cloned',
      after: { sourceId: id },
    });

    return this.toResponse(row);
  }

  async newVersion(actor: ActorContext, id: string): Promise<CareerPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const rootId = existing.rootId ?? existing.id;
    const maxVersion = await this.prisma.careerPath.aggregate({
      where: { OR: [{ rootId }, { id: rootId }], deletedAt: null },
      _max: { version: true },
    });

    const versionFields = buildNewVersionFields(existing, (maxVersion._max.version ?? existing.version) + 1);
    const row = await this.prisma.careerPath.create({
      data: {
        companyId: existing.companyId,
        code: existing.code,
        name: existing.name,
        description: existing.description,
        ...versionFields,
        createdBy: actor.userId,
        steps: {
          create: existing.steps.map((step) => ({
            positionDefinitionId: step.positionDefinitionId,
            stepOrder: step.stepOrder,
            notes: step.notes,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await this.audit.record(actor, {
      entityType: 'career_path',
      entityId: row.id,
      action: 'versioned',
      after: { sourceId: id, version: row.version },
    });

    return this.toResponse(row);
  }

  private mapSteps(steps: CareerPathStepInputDto[]) {
    return steps.map((step, index) => ({
      positionDefinitionId: step.positionDefinitionId,
      stepOrder: step.stepOrder ?? index,
      notes: step.notes ?? null,
    }));
  }

  private async getOrThrow(id: string): Promise<CareerPathRow> {
    const row = await this.prisma.careerPath.findFirst({
      where: { id, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!row) throw new CareerPathNotFoundError(id);
    return row;
  }

  private toResponse(row: CareerPathRow): CareerPathResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      version: row.version,
      rootId: row.rootId,
      sourceId: row.sourceId,
      steps: row.steps.map((step) => ({
        id: step.id,
        positionDefinitionId: step.positionDefinitionId,
        stepOrder: step.stepOrder,
        notes: step.notes,
      })),
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
