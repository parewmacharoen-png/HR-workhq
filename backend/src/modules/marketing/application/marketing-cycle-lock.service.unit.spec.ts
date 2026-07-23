// ============================================================================
// marketing-cycle-lock.service.unit.spec.ts
// ============================================================================

import { MarketingCycleLockService } from './marketing-cycle-lock.service';
import { CommissionCycleLockedError } from '../../commission/domain/errors/commission-finalization.errors';

describe('MarketingCycleLockService', () => {
  const locks = {
    findByCompanyAndCycle: jest.fn(),
    upsertLock: jest.fn(),
    upsertUnlock: jest.fn(),
  };
  const auditRepo = { appendMany: jest.fn(), listByReportId: jest.fn(), search: jest.fn() };
  const prisma = {
    payrollCycle: { findFirst: jest.fn() },
    commissionCycle: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const companyAccess = { assertCompanyAccess: jest.fn() };
  const cycleResolver = { resolveEarnCycleId: jest.fn(), resolveOpenEarnCycleId: jest.fn() };

  const service = new MarketingCycleLockService(
    locks as never,
    auditRepo as never,
    prisma as never,
    companyAccess as never,
    cycleResolver as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('throws CommissionCycleLockedError when cycle is locked', async () => {
    cycleResolver.resolveEarnCycleId.mockResolvedValue('cycle-1');
    locks.findByCompanyAndCycle.mockResolvedValue({ status: 'locked', earnCycleId: 'cycle-1' });

    await expect(service.assertUnlockedForReportDate('company-1', new Date('2026-06-21')))
      .rejects
      .toBeInstanceOf(CommissionCycleLockedError);
  });

  it('allows changes when cycle is unlocked', async () => {
    cycleResolver.resolveEarnCycleId.mockResolvedValue('cycle-1');
    locks.findByCompanyAndCycle.mockResolvedValue({ status: 'unlocked' });

    await expect(service.assertUnlockedForReportDate('company-1', new Date('2026-06-21')))
      .resolves
      .toBeUndefined();
  });
});
