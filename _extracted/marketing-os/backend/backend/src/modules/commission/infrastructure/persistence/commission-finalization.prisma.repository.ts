// ============================================================================
// modules/commission/infrastructure/persistence/commission-finalization.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  CommissionCycleAuditRow,
  CommissionCycleRow,
  CommissionFinalizationRepository,
  UpsertCommissionCycleInput,
} from '../../domain/repositories/commission-finalization.repository';

function dec(n: number): Prisma.Decimal {
  return new Prisma.Decimal(n);
}

function mapCycle(row: {
  id: string;
  companyId: string;
  earnCycleId: string;
  type: string;
  teamId: string | null;
  sourceCycleId: string;
  status: string;
  approvedBy: string | null;
  approvedAt: Date | null;
  finalizedBy: string | null;
  finalizedAt: Date | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  totalCommission: Prisma.Decimal;
  totalRecipients: number;
  createdAt: Date;
  updatedAt: Date;
}): CommissionCycleRow {
  return {
    id: row.id,
    companyId: row.companyId,
    earnCycleId: row.earnCycleId,
    type: row.type as CommissionCycleRow['type'],
    teamId: row.teamId,
    sourceCycleId: row.sourceCycleId,
    status: row.status as CommissionCycleRow['status'],
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt,
    finalizedBy: row.finalizedBy,
    finalizedAt: row.finalizedAt,
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt,
    totalCommission: Number(row.totalCommission),
    totalRecipients: row.totalRecipients,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

@Injectable()
export class PrismaCommissionFinalizationRepository implements CommissionFinalizationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CommissionCycleRow | null> {
    const row = await this.prisma.commissionCycle.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? mapCycle(row) : null;
  }

  async findBySource(type: CommissionCycleRow['type'], sourceCycleId: string): Promise<CommissionCycleRow | null> {
    const row = await this.prisma.commissionCycle.findFirst({
      where: { type, sourceCycleId, deletedAt: null },
    });
    return row ? mapCycle(row) : null;
  }

  async list(filters: {
    companyId: string;
    earnCycleId?: string;
    type?: CommissionCycleRow['type'];
    status?: CommissionCycleRow['status'];
  }): Promise<CommissionCycleRow[]> {
    const rows = await this.prisma.commissionCycle.findMany({
      where: {
        companyId: filters.companyId,
        deletedAt: null,
        ...(filters.earnCycleId ? { earnCycleId: filters.earnCycleId } : {}),
        ...(filters.type ? { type: filters.type } : {}),
        ...(filters.status ? { status: filters.status } : {}),
      },
      orderBy: [{ earnCycleId: 'desc' }, { type: 'asc' }, { createdAt: 'desc' }],
    });
    return rows.map(mapCycle);
  }

  async upsertFromCalculation(input: UpsertCommissionCycleInput): Promise<CommissionCycleRow> {
    const existing = await this.prisma.commissionCycle.findFirst({
      where: {
        companyId: input.companyId,
        type: input.type,
        sourceCycleId: input.sourceCycleId,
        deletedAt: null,
      },
    });

    if (existing) {
      if (existing.status === 'locked' || existing.status === 'finalized') {
        return mapCycle(existing);
      }
      const row = await this.prisma.commissionCycle.update({
        where: { id: existing.id },
        data: {
          totalCommission: dec(input.totalCommission),
          totalRecipients: input.totalRecipients,
          updatedBy: input.actorUserId,
        },
      });
      return mapCycle(row);
    }

    const row = await this.prisma.commissionCycle.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        earnCycleId: input.earnCycleId,
        type: input.type,
        teamId: input.teamId ?? null,
        sourceCycleId: input.sourceCycleId,
        status: input.status ?? 'draft',
        totalCommission: dec(input.totalCommission),
        totalRecipients: input.totalRecipients,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return mapCycle(row);
  }

  async updateStatus(
    id: string,
    input: {
      status: CommissionCycleRow['status'];
      actorUserId: string;
      approvedBy?: string;
      approvedAt?: Date;
      finalizedBy?: string;
      finalizedAt?: Date;
      lockedBy?: string;
      lockedAt?: Date;
      totalCommission?: number;
      totalRecipients?: number;
    },
  ): Promise<CommissionCycleRow> {
    const row = await this.prisma.commissionCycle.update({
      where: { id },
      data: {
        status: input.status,
        updatedBy: input.actorUserId,
        ...(input.approvedBy !== undefined ? { approvedBy: input.approvedBy } : {}),
        ...(input.approvedAt !== undefined ? { approvedAt: input.approvedAt } : {}),
        ...(input.finalizedBy !== undefined ? { finalizedBy: input.finalizedBy } : {}),
        ...(input.finalizedAt !== undefined ? { finalizedAt: input.finalizedAt } : {}),
        ...(input.lockedBy !== undefined ? { lockedBy: input.lockedBy } : {}),
        ...(input.lockedAt !== undefined ? { lockedAt: input.lockedAt } : {}),
        ...(input.totalCommission !== undefined ? { totalCommission: dec(input.totalCommission) } : {}),
        ...(input.totalRecipients !== undefined ? { totalRecipients: input.totalRecipients } : {}),
      },
    });
    return mapCycle(row);
  }

  async createAudit(input: {
    commissionCycleId: string;
    action: CommissionCycleAuditRow['action'];
    userId: string;
    beforeStatus: CommissionCycleRow['status'] | null;
    afterStatus: CommissionCycleRow['status'];
    metadata?: unknown;
  }): Promise<CommissionCycleAuditRow> {
    const row = await this.prisma.commissionCycleAudit.create({
      data: {
        id: randomUUID(),
        commissionCycleId: input.commissionCycleId,
        action: input.action,
        userId: input.userId,
        beforeStatus: input.beforeStatus,
        afterStatus: input.afterStatus,
        metadata: input.metadata as Prisma.InputJsonValue | undefined,
      },
    });
    return {
      id: row.id,
      commissionCycleId: row.commissionCycleId,
      action: row.action as CommissionCycleAuditRow['action'],
      userId: row.userId,
      beforeStatus: row.beforeStatus as CommissionCycleRow['status'] | null,
      afterStatus: row.afterStatus as CommissionCycleRow['status'],
      metadata: row.metadata,
      createdAt: row.createdAt,
    };
  }

  async listAudits(commissionCycleId: string): Promise<CommissionCycleAuditRow[]> {
    const rows = await this.prisma.commissionCycleAudit.findMany({
      where: { commissionCycleId },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => ({
      id: row.id,
      commissionCycleId: row.commissionCycleId,
      action: row.action as CommissionCycleAuditRow['action'],
      userId: row.userId,
      beforeStatus: row.beforeStatus as CommissionCycleRow['status'] | null,
      afterStatus: row.afterStatus as CommissionCycleRow['status'],
      metadata: row.metadata,
      createdAt: row.createdAt,
    }));
  }

  async isEarnCycleLocked(companyId: string, earnCycleId: string): Promise<boolean> {
    const row = await this.prisma.commissionCycle.findFirst({
      where: {
        companyId,
        earnCycleId,
        status: 'locked',
        deletedAt: null,
      },
    });
    return !!row;
  }

  async isMarketingTeamCycleLocked(
    companyId: string,
    earnCycleId: string,
    teamId: string,
  ): Promise<boolean> {
    const row = await this.prisma.commissionCycle.findFirst({
      where: {
        companyId,
        earnCycleId,
        teamId,
        type: 'marketing',
        status: 'locked',
        deletedAt: null,
      },
    });
    return !!row;
  }
}
