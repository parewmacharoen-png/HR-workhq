// ============================================================================
// modules/performance-review/application/performance-weight-profile.service.ts
// KPI-003
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import {
  PerformanceReviewInvalidStatusError,
  PerformanceWeightProfileNotFoundError,
} from '../domain/errors/performance-review.errors';
import { PerformanceReviewAccessService } from './performance-review-access.service';
import {
  CreatePerformanceWeightProfileDto,
  PerformanceWeightProfileResponse,
  UpdatePerformanceWeightProfileDto,
} from './dto/performance-review.dto';

type ProfileRow = Prisma.PerformanceWeightProfileGetPayload<Record<string, never>>;

@Injectable()
export class PerformanceWeightProfileService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PerformanceReviewAccessService,
    private readonly audit: AuditService,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreatePerformanceWeightProfileDto,
  ): Promise<PerformanceWeightProfileResponse> {
    await this.access.assertCanManageProfiles(actor, dto.companyId);

    if (dto.isDefault) {
      await this.clearDefault(dto.companyId);
    }

    const profile = await this.prisma.performanceWeightProfile.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        kpiWeight: decimal(dto.kpiWeight),
        leaderReviewWeight: decimal(dto.leaderReviewWeight),
        selfReviewWeight: decimal(dto.selfReviewWeight),
        feedback360Weight: decimal(dto.feedback360Weight),
        isDefault: dto.isDefault ?? false,
        status: 'draft',
        version: 1,
        createdBy: actor.userId,
      },
    });

    await this.prisma.performanceWeightProfile.update({
      where: { id: profile.id },
      data: { rootId: profile.id },
    });

    await this.audit.record(actor, {
      entityType: 'performance_weight_profile',
      entityId: profile.id,
      action: 'created',
    });

    return this.toResponse({ ...profile, rootId: profile.id });
  }

  async list(actor: ActorContext, companyId: string): Promise<PerformanceWeightProfileResponse[]> {
    await this.access.assertCanViewProfiles(actor, companyId);

    const rows = await this.prisma.performanceWeightProfile.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { updatedAt: 'desc' },
    });

    return rows.map((row) => this.toResponse(row));
  }

  async update(
    actor: ActorContext,
    id: string,
    dto: UpdatePerformanceWeightProfileDto,
  ): Promise<PerformanceWeightProfileResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManageProfiles(actor, existing.companyId);

    if (dto.isDefault) {
      await this.clearDefault(existing.companyId, id);
    }

    const profile = await this.prisma.performanceWeightProfile.update({
      where: { id },
      data: {
        name: dto.name ?? existing.name,
        kpiWeight: dto.kpiWeight != null ? decimal(dto.kpiWeight) : existing.kpiWeight,
        leaderReviewWeight: dto.leaderReviewWeight != null
          ? decimal(dto.leaderReviewWeight)
          : existing.leaderReviewWeight,
        selfReviewWeight: dto.selfReviewWeight != null
          ? decimal(dto.selfReviewWeight)
          : existing.selfReviewWeight,
        feedback360Weight: dto.feedback360Weight != null
          ? decimal(dto.feedback360Weight)
          : existing.feedback360Weight,
        isDefault: dto.isDefault ?? existing.isDefault,
        status: dto.status ?? existing.status,
      },
    });

    await this.audit.record(actor, {
      entityType: 'performance_weight_profile',
      entityId: id,
      action: 'updated',
    });

    return this.toResponse(profile);
  }

  async clone(actor: ActorContext, id: string): Promise<PerformanceWeightProfileResponse> {
    const source = await this.getOrThrow(id);
    await this.access.assertCanManageProfiles(actor, source.companyId);

    const rootId = source.rootId ?? source.id;
    const cloned = await this.prisma.performanceWeightProfile.create({
      data: {
        companyId: source.companyId,
        name: `${source.name} (Copy)`,
        kpiWeight: source.kpiWeight,
        leaderReviewWeight: source.leaderReviewWeight,
        selfReviewWeight: source.selfReviewWeight,
        feedback360Weight: source.feedback360Weight,
        isDefault: false,
        status: 'draft',
        version: 1,
        rootId,
        sourceId: source.id,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'performance_weight_profile',
      entityId: cloned.id,
      action: 'cloned',
      after: { sourceId: id },
    });

    return this.toResponse(cloned);
  }

  async archive(actor: ActorContext, id: string): Promise<PerformanceWeightProfileResponse> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManageProfiles(actor, existing.companyId);

    const profile = await this.prisma.performanceWeightProfile.update({
      where: { id },
      data: { status: 'archived', isDefault: false },
    });

    await this.audit.record(actor, {
      entityType: 'performance_weight_profile',
      entityId: id,
      action: 'archived',
    });

    return this.toResponse(profile);
  }

  async delete(actor: ActorContext, id: string): Promise<void> {
    const existing = await this.getOrThrow(id);
    await this.access.assertCanManageProfiles(actor, existing.companyId);

    if (existing.status === 'active') {
      throw new PerformanceReviewInvalidStatusError(
        'Active weight profiles must be archived before deletion',
      );
    }

    await this.prisma.performanceWeightProfile.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actor.userId },
    });

    await this.audit.record(actor, {
      entityType: 'performance_weight_profile',
      entityId: id,
      action: 'deleted',
    });
  }

  async createVersion(actor: ActorContext, id: string): Promise<PerformanceWeightProfileResponse> {
    const source = await this.getOrThrow(id);
    await this.access.assertCanManageProfiles(actor, source.companyId);

    const rootId = source.rootId ?? source.id;
    const latest = await this.prisma.performanceWeightProfile.findFirst({
      where: { rootId, deletedAt: null },
      orderBy: { version: 'desc' },
    });
    const nextVersion = (latest?.version ?? source.version) + 1;

    await this.prisma.performanceWeightProfile.updateMany({
      where: { rootId, status: 'active', deletedAt: null },
      data: { status: 'archived', isDefault: false },
    });

    const versioned = await this.prisma.performanceWeightProfile.create({
      data: {
        companyId: source.companyId,
        name: source.name,
        kpiWeight: source.kpiWeight,
        leaderReviewWeight: source.leaderReviewWeight,
        selfReviewWeight: source.selfReviewWeight,
        feedback360Weight: source.feedback360Weight,
        isDefault: source.isDefault,
        status: 'draft',
        version: nextVersion,
        rootId,
        sourceId: source.id,
        createdBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'performance_weight_profile',
      entityId: versioned.id,
      action: 'version_created',
      after: { sourceId: id, version: nextVersion },
    });

    return this.toResponse(versioned);
  }

  async getOrThrow(id: string): Promise<ProfileRow> {
    const profile = await this.prisma.performanceWeightProfile.findFirst({
      where: { id, deletedAt: null },
    });
    if (!profile) throw new PerformanceWeightProfileNotFoundError(id);
    return profile;
  }

  toResponse(profile: ProfileRow): PerformanceWeightProfileResponse {
    return {
      id: profile.id,
      companyId: profile.companyId,
      name: profile.name,
      kpiWeight: Number(profile.kpiWeight),
      leaderReviewWeight: Number(profile.leaderReviewWeight),
      selfReviewWeight: Number(profile.selfReviewWeight),
      feedback360Weight: Number(profile.feedback360Weight),
      isDefault: profile.isDefault,
      status: profile.status,
      version: profile.version,
      rootId: profile.rootId,
      sourceId: profile.sourceId,
      createdAt: profile.createdAt.toISOString(),
      updatedAt: profile.updatedAt.toISOString(),
    };
  }

  private async clearDefault(companyId: string, exceptId?: string): Promise<void> {
    await this.prisma.performanceWeightProfile.updateMany({
      where: {
        companyId,
        deletedAt: null,
        isDefault: true,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      data: { isDefault: false },
    });
  }
}

function decimal(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value);
}
