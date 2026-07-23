// ============================================================================
// modules/position-framework/application/position-definition.service.ts
// KPI-004
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { PositionDefinitionNotFoundError } from '../domain/errors/position-framework.errors';
import { PositionFrameworkAccessService } from './position-framework-access.service';
import {
  buildArchiveData,
  buildCloneVersionFields,
  buildNewVersionFields,
  buildSoftDeleteData,
} from './framework-entity.util';
import {
  CreatePositionDefinitionDto,
  PositionDefinitionResponse,
  UpdatePositionDefinitionDto,
} from './dto/position-framework.dto';

@Injectable()
export class PositionDefinitionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PositionFrameworkAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePositionDefinitionDto,
  ): Promise<PositionDefinitionResponse> {
    await this.access.assertCanManage(actor, dto.companyId);

    const row = await this.prisma.positionDefinition.create({
      data: {
        companyId: dto.companyId,
        familyId: dto.familyId ?? null,
        levelId: dto.levelId ?? null,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        status: 'draft',
        version: 1,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_definition',
      entityId: row.id,
      action: 'created',
    });

    return this.toResponse(row);
  }

  async list(actor: ActorContext, companyId: string): Promise<PositionDefinitionResponse[]> {
    await this.access.assertCanView(actor, companyId);

    const rows = await this.prisma.positionDefinition.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePositionDefinitionDto,
  ): Promise<PositionDefinitionResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const row = await this.prisma.positionDefinition.update({
      where: { id },
      data: {
        familyId: dto.familyId !== undefined ? dto.familyId : existing.familyId,
        levelId: dto.levelId !== undefined ? dto.levelId : existing.levelId,
        code: dto.code ?? existing.code,
        name: dto.name ?? existing.name,
        description: dto.description !== undefined ? dto.description : existing.description,
        status: dto.status ?? existing.status,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_definition',
      entityId: id,
      action: 'updated',
    });

    return this.toResponse(row);
  }

  async softDelete(actor: ActorContext, id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    await this.prisma.positionDefinition.update({
      where: { id },
      data: buildSoftDeleteData(actor.userId),
    });

    await this.audit.record(actor, {
      entityType: 'position_definition',
      entityId: id,
      action: 'deleted',
    });
  }

  async archive(actor: ActorContext, id: string): Promise<PositionDefinitionResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const row = await this.prisma.positionDefinition.update({
      where: { id },
      data: buildArchiveData(),
    });

    await this.audit.record(actor, {
      entityType: 'position_definition',
      entityId: id,
      action: 'archived',
    });

    return this.toResponse(row);
  }

  async clone(actor: ActorContext, id: string): Promise<PositionDefinitionResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const versionFields = buildCloneVersionFields(existing);
    const row = await this.prisma.positionDefinition.create({
      data: {
        companyId: existing.companyId,
        familyId: existing.familyId,
        levelId: existing.levelId,
        code: `${existing.code}-copy`,
        name: `${existing.name} (Copy)`,
        description: existing.description,
        ...versionFields,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_definition',
      entityId: row.id,
      action: 'cloned',
      after: { sourceId: id },
    });

    return this.toResponse(row);
  }

  async newVersion(actor: ActorContext, id: string): Promise<PositionDefinitionResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const rootId = existing.rootId ?? existing.id;
    const maxVersion = await this.prisma.positionDefinition.aggregate({
      where: { OR: [{ rootId }, { id: rootId }], deletedAt: null },
      _max: { version: true },
    });

    const versionFields = buildNewVersionFields(existing, (maxVersion._max.version ?? existing.version) + 1);
    const row = await this.prisma.positionDefinition.create({
      data: {
        companyId: existing.companyId,
        familyId: existing.familyId,
        levelId: existing.levelId,
        code: existing.code,
        name: existing.name,
        description: existing.description,
        ...versionFields,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_definition',
      entityId: row.id,
      action: 'versioned',
      after: { sourceId: id, version: row.version },
    });

    return this.toResponse(row);
  }

  private async getOrThrow(id: string) {
    const row = await this.prisma.positionDefinition.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new PositionDefinitionNotFoundError(id);
    return row;
  }

  private toResponse(row: {
    id: string;
    companyId: string;
    familyId: string | null;
    levelId: string | null;
    code: string;
    name: string;
    description: string | null;
    status: 'draft' | 'active' | 'archived';
    version: number;
    rootId: string | null;
    sourceId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PositionDefinitionResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      familyId: row.familyId,
      levelId: row.levelId,
      code: row.code,
      name: row.name,
      description: row.description,
      status: row.status,
      version: row.version,
      rootId: row.rootId,
      sourceId: row.sourceId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
