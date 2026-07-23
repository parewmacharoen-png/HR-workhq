// ============================================================================
// modules/marketing/infrastructure/persistence/marketing-cycle-lock.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  MarketingCycleLockRepository,
  MarketingCycleLockRow,
} from '../../domain/repositories/marketing-cycle-lock.repository';

@Injectable()
export class PrismaMarketingCycleLockRepository implements MarketingCycleLockRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findByCompanyAndCycle(
    companyId: string,
    earnCycleId: string,
  ): Promise<MarketingCycleLockRow | null> {
    const row = await this.prisma.marketingCycleLock.findUnique({
      where: { companyId_earnCycleId: { companyId, earnCycleId } },
    });
    return row ? this.map(row) : null;
  }

  async upsertLock(input: {
    companyId: string;
    earnCycleId: string;
    lockedBy: string;
    lockReason: string;
  }): Promise<MarketingCycleLockRow> {
    const now = new Date();
    const row = await this.prisma.marketingCycleLock.upsert({
      where: {
        companyId_earnCycleId: {
          companyId: input.companyId,
          earnCycleId: input.earnCycleId,
        },
      },
      create: {
        id: randomUUID(),
        companyId: input.companyId,
        earnCycleId: input.earnCycleId,
        status: 'locked',
        lockedBy: input.lockedBy,
        lockedAt: now,
        lockReason: input.lockReason,
      },
      update: {
        status: 'locked',
        lockedBy: input.lockedBy,
        lockedAt: now,
        lockReason: input.lockReason,
        unlockedBy: null,
        unlockedAt: null,
        unlockReason: null,
      },
    });
    return this.map(row);
  }

  async upsertUnlock(input: {
    companyId: string;
    earnCycleId: string;
    unlockedBy: string;
    unlockReason: string;
  }): Promise<MarketingCycleLockRow> {
    const now = new Date();
    const row = await this.prisma.marketingCycleLock.upsert({
      where: {
        companyId_earnCycleId: {
          companyId: input.companyId,
          earnCycleId: input.earnCycleId,
        },
      },
      create: {
        id: randomUUID(),
        companyId: input.companyId,
        earnCycleId: input.earnCycleId,
        status: 'unlocked',
        unlockedBy: input.unlockedBy,
        unlockedAt: now,
        unlockReason: input.unlockReason,
      },
      update: {
        status: 'unlocked',
        unlockedBy: input.unlockedBy,
        unlockedAt: now,
        unlockReason: input.unlockReason,
      },
    });
    return this.map(row);
  }

  private map(row: {
    id: string;
    companyId: string;
    earnCycleId: string;
    status: MarketingCycleLockRow['status'];
    lockedBy: string | null;
    lockedAt: Date | null;
    lockReason: string | null;
    unlockedBy: string | null;
    unlockedAt: Date | null;
    unlockReason: string | null;
  }): MarketingCycleLockRow {
    return {
      id: row.id,
      companyId: row.companyId,
      earnCycleId: row.earnCycleId,
      status: row.status,
      lockedBy: row.lockedBy,
      lockedAt: row.lockedAt,
      lockReason: row.lockReason,
      unlockedBy: row.unlockedBy,
      unlockedAt: row.unlockedAt,
      unlockReason: row.unlockReason,
    };
  }
}
