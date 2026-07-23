// ============================================================================
// modules/position-framework/application/position-level.service.ts
// KPI-004
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { PositionLevelNotFoundError } from '../domain/errors/position-framework.errors';
import { PositionFrameworkAccessService } from './position-framework-access.service';
import {
  buildArchiveData,
  buildCloneVersionFields,
  buildNewVersionFields,
  buildSoftDeleteData,
} from './framework-entity.util';
import {
  CreatePositionLevelDto,
  PositionLevelResponse,
  UpdatePositionLevelDto,
} from './dto/position-framework.dto';

@Injectable()
export class PositionLevelService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PositionFrameworkAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: ActorContext, dto: CreatePositionLevelDto): Promise<PositionLevelResponse> {
    await this.access.assertCanManage(actor, dto.companyId);

    const row = await this.prisma.positionLevel.create({
      data: {
        companyId: dto.companyId,
        familyId: dto.familyId ?? null,
        code: dto.code,
        name: dto.name,
        rankOrder: dto.rankOrder ?? 0,
        description: dto.description ?? null,
        status: 'draft',
        version: 1,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_level',
      entityId: row.id,
      action: 'created',
    });

    return this.toResponse(row);
  }

  async list(actor: ActorContext, companyId: string): Promise<PositionLevelResponse[]> {
    await this.access.assertCanView(actor, companyId);

    const rows = await this.prisma.positionLevel.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ rankOrder: 'asc' }, { code: 'asc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePositionLevelDto,
  ): Promise<PositionLevelResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const row = await this.prisma.positionLevel.update({
      where: { id },
      data: {
        familyId: dto.familyId !== undefined ? dto.familyId : existing.familyId,
        code: dto.code ?? existing.code,
        name: dto.name ?? existing.name,
        rankOrder: dto.rankOrder ?? existing.rankOrder,
        description: dto.description !== undefined ? dto.description : existing.description,
        status: dto.status ?? existing.status,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_level',
      entityId: id,
      action: 'updated',
    });

    return this.toResponse(row);
  }

  async softDelete(actor: ActorContext, id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    await this.prisma.positionLevel.update({
      where: { id },
      data: buildSoftDeleteData(actor.userId),
    });

    await this.audit.record(actor, {
      entityType: 'position_level',
      entityId: id,
      action: 'deleted',
    });
  }

  async archive(actor: ActorContext, id: string): Promise<PositionLevelResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const row = await this.prisma.positionLevel.update({
      where: { id },
      data: buildArchiveData(),
    });

    await this.audit.record(actor, {
      entityType: 'position_level',
      entityId: id,
      action: 'archived',
    });

    return this.toResponse(row);
  }

  async clone(actor: ActorContext, id: string): Promise<PositionLevelResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const versionFields = buildCloneVersionFields(existing);
    const row = await this.prisma.positionLevel.create({
      data: {
        companyId: existing.companyId,
        familyId: existing.familyId,
        code: `${existing.code}-copy`,
        name: `${existing.name} (Copy)`,
        rankOrder: existing.rankOrder,
        description: existing.description,
        ...versionFields,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_level',
      entityId: row.id,
      action: 'cloned',
      after: { sourceId: id },
    });

    return this.toResponse(row);
  }

  async newVersion(actor: ActorContext, id: string): Promise<PositionLevelResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const rootId = existing.rootId ?? existing.id;
    const maxVersion = await this.prisma.positionLevel.aggregate({
      where: { OR: [{ rootId }, { id: rootId }], deletedAt: null },
      _max: { version: true },
    });

    const versionFields = buildNewVersionFields(existing, (maxVersion._max.version ?? existing.version) + 1);
    const row = await this.prisma.positionLevel.create({
      data: {
        companyId: existing.companyId,
        familyId: existing.familyId,
        code: existing.code,
        name: existing.name,
        rankOrder: existing.rankOrder,
        description: existing.description,
        ...versionFields,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'position_level',
      entityId: row.id,
      action: 'versioned',
      after: { sourceId: id, version: row.version },
    });

    return this.toResponse(row);
  }

  private async getOrThrow(id: string) {
    const row = await this.prisma.positionLevel.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new PositionLevelNotFoundError(id);
    return row;
  }

  private toResponse(row: {
    id: string;
    companyId: string;
    familyId: string | null;
    code: string;
    name: string;
    rankOrder: number;
    description: string | null;
    status: 'draft' | 'active' | 'archived';
    version: number;
    rootId: string | null;
    sourceId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PositionLevelResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      familyId: row.familyId,
      code: row.code,
      name: row.name,
      rankOrder: row.rankOrder,
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
