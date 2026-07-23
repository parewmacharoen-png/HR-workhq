// ============================================================================
// modules/position-framework/application/promotion-path.service.ts
// KPI-004
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import {
  PositionFrameworkValidationError,
  PromotionPathNotFoundError,
} from '../domain/errors/position-framework.errors';
import { PositionFrameworkAccessService } from './position-framework-access.service';
import {
  buildArchiveData,
  buildCloneVersionFields,
  buildNewVersionFields,
  buildSoftDeleteData,
} from './framework-entity.util';
import {
  CreatePromotionPathDto,
  PromotionPathResponse,
  UpdatePromotionPathDto,
} from './dto/position-framework.dto';

@Injectable()
export class PromotionPathService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PositionFrameworkAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(actor: ActorContext, dto: CreatePromotionPathDto): Promise<PromotionPathResponse> {
    await this.access.assertCanManage(actor, dto.companyId);
    this.assertDistinctPositions(dto.fromPositionId, dto.toPositionId);

    const row = await this.prisma.promotionPath.create({
      data: {
        companyId: dto.companyId,
        code: dto.code,
        name: dto.name,
        description: dto.description ?? null,
        fromPositionId: dto.fromPositionId,
        toPositionId: dto.toPositionId,
        requirements: dto.requirements ?? null,
        status: 'draft',
        version: 1,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_path',
      entityId: row.id,
      action: 'created',
    });

    return this.toResponse(row);
  }

  async list(actor: ActorContext, companyId: string): Promise<PromotionPathResponse[]> {
    await this.access.assertCanView(actor, companyId);

    const rows = await this.prisma.promotionPath.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ code: 'asc' }, { version: 'desc' }],
    });

    return rows.map((row) => this.toResponse(row));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePromotionPathDto,
  ): Promise<PromotionPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const fromPositionId = dto.fromPositionId ?? existing.fromPositionId;
    const toPositionId = dto.toPositionId ?? existing.toPositionId;
    this.assertDistinctPositions(fromPositionId, toPositionId);

    const row = await this.prisma.promotionPath.update({
      where: { id },
      data: {
        code: dto.code ?? existing.code,
        name: dto.name ?? existing.name,
        description: dto.description !== undefined ? dto.description : existing.description,
        fromPositionId,
        toPositionId,
        requirements: dto.requirements !== undefined ? dto.requirements : existing.requirements,
        status: dto.status ?? existing.status,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_path',
      entityId: id,
      action: 'updated',
    });

    return this.toResponse(row);
  }

  async softDelete(actor: ActorContext, id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    await this.prisma.promotionPath.update({
      where: { id },
      data: buildSoftDeleteData(actor.userId),
    });

    await this.audit.record(actor, {
      entityType: 'promotion_path',
      entityId: id,
      action: 'deleted',
    });
  }

  async archive(actor: ActorContext, id: string): Promise<PromotionPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const row = await this.prisma.promotionPath.update({
      where: { id },
      data: buildArchiveData(),
    });

    await this.audit.record(actor, {
      entityType: 'promotion_path',
      entityId: id,
      action: 'archived',
    });

    return this.toResponse(row);
  }

  async clone(actor: ActorContext, id: string): Promise<PromotionPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const versionFields = buildCloneVersionFields(existing);
    const row = await this.prisma.promotionPath.create({
      data: {
        companyId: existing.companyId,
        code: `${existing.code}-copy`,
        name: `${existing.name} (Copy)`,
        description: existing.description,
        fromPositionId: existing.fromPositionId,
        toPositionId: existing.toPositionId,
        requirements: existing.requirements,
        ...versionFields,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_path',
      entityId: row.id,
      action: 'cloned',
      after: { sourceId: id },
    });

    return this.toResponse(row);
  }

  async newVersion(actor: ActorContext, id: string): Promise<PromotionPathResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManage(actor, existing.companyId);

    const rootId = existing.rootId ?? existing.id;
    const maxVersion = await this.prisma.promotionPath.aggregate({
      where: { OR: [{ rootId }, { id: rootId }], deletedAt: null },
      _max: { version: true },
    });

    const versionFields = buildNewVersionFields(existing, (maxVersion._max.version ?? existing.version) + 1);
    const row = await this.prisma.promotionPath.create({
      data: {
        companyId: existing.companyId,
        code: existing.code,
        name: existing.name,
        description: existing.description,
        fromPositionId: existing.fromPositionId,
        toPositionId: existing.toPositionId,
        requirements: existing.requirements,
        ...versionFields,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'promotion_path',
      entityId: row.id,
      action: 'versioned',
      after: { sourceId: id, version: row.version },
    });

    return this.toResponse(row);
  }

  private assertDistinctPositions(fromPositionId: string, toPositionId: string): void {
    if (fromPositionId === toPositionId) {
      throw new PositionFrameworkValidationError('From and to positions must differ');
    }
  }

  private async getOrThrow(id: string) {
    const row = await this.prisma.promotionPath.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new PromotionPathNotFoundError(id);
    return row;
  }

  private toResponse(row: {
    id: string;
    companyId: string;
    code: string;
    name: string;
    description: string | null;
    fromPositionId: string;
    toPositionId: string;
    requirements: string | null;
    status: 'draft' | 'active' | 'archived';
    version: number;
    rootId: string | null;
    sourceId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): PromotionPathResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      code: row.code,
      name: row.name,
      description: row.description,
      fromPositionId: row.fromPositionId,
      toPositionId: row.toPositionId,
      requirements: row.requirements,
      status: row.status,
      version: row.version,
      rootId: row.rootId,
      sourceId: row.sourceId,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }
}
