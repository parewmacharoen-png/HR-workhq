// ============================================================================
// commission-finalization.service.unit.spec.ts
// ============================================================================

import { CommissionFinalizationService } from './commission-finalization.service';
import {
  CommissionCycleInvalidTransitionError,
  CommissionCycleLockedError,
  CommissionCycleNotFoundError,
} from '../domain/errors/commission-finalization.errors';

describe('CommissionFinalizationService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'company-1' };

  const repo = {
    findById: jest.fn(),
    findBySource: jest.fn(),
    list: jest.fn(),
    upsertFromCalculation: jest.fn(),
    updateStatus: jest.fn(),
    createAudit: jest.fn(),
    listAudits: jest.fn(),
    isEarnCycleLocked: jest.fn(),
    isMarketingTeamCycleLocked: jest.fn(),
  };
  const marketingRepo = {
    findCycleById: jest.fn(),
    listMemberResults: jest.fn(),
  };
  const adminRepo = {
    findCycleById: jest.fn(),
    listMemberResults: jest.fn(),
    resolvePayCycleId: jest.fn(),
  };
  const marketingCommission = { finalize: jest.fn() };
  const adminCommission = { finalize: jest.fn() };
  const marketingCycleLock = { lockCycle: jest.fn() };
  const audit = { record: jest.fn() };
  const companyAccess = { assertCompanyAccess: jest.fn() };
  const prisma = {
    marketingCommissionMemberResult: { findMany: jest.fn() },
    marketingCommissionCarryForward: { findMany: jest.fn() },
    commissionRecord: { findMany: jest.fn(), update: jest.fn() },
    referral: { findMany: jest.fn(), update: jest.fn() },
    payrollItem: { findFirst: jest.fn(), create: jest.fn() },
    payrollCycle: { findFirst: jest.fn() },
  };
  const cycleResolver = { resolveEarnCycleId: jest.fn() };

  const service = new CommissionFinalizationService(
    repo as never,
    marketingRepo as never,
    adminRepo as never,
    marketingCommission as never,
    adminCommission as never,
    marketingCycleLock as never,
    audit as never,
    companyAccess as never,
    prisma as never,
    cycleResolver as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('approve transitions draft to approved', async () => {
    repo.findById.mockResolvedValue({
      id: 'cycle-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      type: 'admin',
      teamId: null,
      sourceCycleId: 'source-1',
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      finalizedBy: null,
      finalizedAt: null,
      lockedBy: null,
      lockedAt: null,
      totalCommission: 0,
      totalRecipients: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    adminRepo.findCycleById.mockResolvedValue({
      id: 'source-1',
      totalPayable: 5000,
    });
    adminRepo.listMemberResults.mockResolvedValue([
      { employeeId: 'emp-1', finalPayout: 5000, status: 'pending_pay' },
    ]);
    repo.updateStatus.mockImplementation((_id, input) => ({
      id: 'cycle-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      type: 'admin',
      teamId: null,
      sourceCycleId: 'source-1',
      status: input.status,
      approvedBy: input.approvedBy ?? null,
      approvedAt: input.approvedAt ?? null,
      finalizedBy: null,
      finalizedAt: null,
      lockedBy: null,
      lockedAt: null,
      totalCommission: input.totalCommission ?? 0,
      totalRecipients: input.totalRecipients ?? 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));

    const result = await service.approveCycle(actor, 'cycle-1');
    expect(result.status).toBe('approved');
    expect(repo.createAudit).toHaveBeenCalledWith(expect.objectContaining({
      action: 'approve',
      beforeStatus: 'draft',
      afterStatus: 'approved',
    }));
  });

  it('finalize rejects when not approved', async () => {
    repo.findById.mockResolvedValue({
      id: 'cycle-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      type: 'marketing',
      teamId: 'team-1',
      sourceCycleId: 'source-1',
      status: 'draft',
      approvedBy: null,
      approvedAt: null,
      finalizedBy: null,
      finalizedAt: null,
      lockedBy: null,
      lockedAt: null,
      totalCommission: 0,
      totalRecipients: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.finalizeCycle(actor, 'cycle-1'))
      .rejects
      .toBeInstanceOf(CommissionCycleInvalidTransitionError);
  });

  it('finalize delegates to marketing service and is idempotent when already finalized', async () => {
    repo.findById.mockResolvedValue({
      id: 'cycle-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      type: 'marketing',
      teamId: 'team-1',
      sourceCycleId: 'source-1',
      status: 'finalized',
      approvedBy: 'user-1',
      approvedAt: new Date(),
      finalizedBy: 'user-1',
      finalizedAt: new Date(),
      lockedBy: null,
      lockedAt: null,
      totalCommission: 1000,
      totalRecipients: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await service.finalizeCycle(actor, 'cycle-1');
    expect(result.payrollItemsCreated).toBe(0);
    expect(marketingCommission.finalize).not.toHaveBeenCalled();
  });

  it('lock requires finalized status', async () => {
    repo.findById.mockResolvedValue({
      id: 'cycle-1',
      companyId: 'company-1',
      earnCycleId: 'earn-1',
      type: 'marketing',
      teamId: 'team-1',
      sourceCycleId: 'source-1',
      status: 'approved',
      approvedBy: 'user-1',
      approvedAt: new Date(),
      finalizedBy: null,
      finalizedAt: null,
      lockedBy: null,
      lockedAt: null,
      totalCommission: 1000,
      totalRecipients: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(service.lockCycle(actor, 'cycle-1'))
      .rejects
      .toBeInstanceOf(CommissionCycleInvalidTransitionError);
  });

  it('assertUnlockedForEarnCycle throws CommissionCycleLockedError', async () => {
    repo.isEarnCycleLocked.mockResolvedValue(true);
    await expect(service.assertUnlockedForEarnCycle('company-1', 'earn-1'))
      .rejects
      .toBeInstanceOf(CommissionCycleLockedError);
  });

  it('getCycleStatus throws when cycle missing', async () => {
    repo.findById.mockResolvedValue(null);
    await expect(service.getCycleStatus(actor, 'missing'))
      .rejects
      .toBeInstanceOf(CommissionCycleNotFoundError);
  });
});
