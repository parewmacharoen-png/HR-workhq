// ============================================================================
// modules/marketing/domain/repositories/marketing-cycle-lock.repository.ts
// ============================================================================

import { MarketingCycleLockStatus } from '@prisma/client';

export const MARKETING_CYCLE_LOCK_REPOSITORY = Symbol('MARKETING_CYCLE_LOCK_REPOSITORY');

export interface MarketingCycleLockRow {
  id: string;
  companyId: string;
  earnCycleId: string;
  status: MarketingCycleLockStatus;
  lockedBy: string | null;
  lockedAt: Date | null;
  lockReason: string | null;
  unlockedBy: string | null;
  unlockedAt: Date | null;
  unlockReason: string | null;
}

export interface MarketingCycleLockRepository {
  findByCompanyAndCycle(companyId: string, earnCycleId: string): Promise<MarketingCycleLockRow | null>;
  upsertLock(input: {
    companyId: string;
    earnCycleId: string;
    lockedBy: string;
    lockReason: string;
  }): Promise<MarketingCycleLockRow>;
  upsertUnlock(input: {
    companyId: string;
    earnCycleId: string;
    unlockedBy: string;
    unlockReason: string;
  }): Promise<MarketingCycleLockRow>;
}
