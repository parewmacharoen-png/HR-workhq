// ============================================================================
// modules/performance/application/performance.service.probation.unit.spec.ts
// EMP-010 — probation resolve outcomes.
// ============================================================================

import { PerformanceService } from './performance.service';

describe('PerformanceService probation (unit)', () => {
  const probations = {
    findById: jest.fn(),
    save: jest.fn().mockResolvedValue(undefined),
    listByEmployee: jest.fn(),
    findActiveForEmployee: jest.fn().mockResolvedValue(null),
  };
  const employeeStatus = { updateEmploymentStatus: jest.fn().mockResolvedValue(undefined) };
  const exitCases = { create: jest.fn().mockResolvedValue({ id: 'exit-1' }) };
  const prisma = {
    $transaction: jest.fn(async (fn: (tx: { employee: { update: jest.Mock } }) => Promise<void>) =>
      fn({ employee: { update: jest.fn().mockResolvedValue(undefined) } })),
    probationReview: { findMany: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const employeeAccess = {
    assertEmployeeReadable: jest.fn().mockResolvedValue('co-1'),
    assertEmployeeInCompany: jest.fn().mockResolvedValue(undefined),
  };
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const reviewEntity = {
    id: 'rev-1',
    employeeId: 'emp-1',
    pass: jest.fn(),
    extend: jest.fn(),
    fail: jest.fn(),
    toPersistence: jest.fn().mockReturnValue({
      id: 'rev-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      probationStartDate: new Date('2026-04-01'),
      probationEndDate: new Date('2026-07-01'),
      outcome: 'pending',
      extendedUntil: null,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      deletedAt: null,
    }),
  };

  const service = new PerformanceService(
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    probations as never,
    {} as never,
    {} as never,
    employeeStatus as never,
    {} as never,
    audit as never,
    prisma as never,
    companyAccess as never,
    employeeAccess as never,
    exitCases as never,
    undefined,
  );

  const actor = { userId: 'hr-1', impersonatorUserId: null, companyId: 'co-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    probations.findById.mockResolvedValue(reviewEntity);
    reviewEntity.toPersistence.mockReturnValue({
      id: 'rev-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      probationStartDate: new Date('2026-04-01'),
      probationEndDate: new Date('2026-07-01'),
      outcome: 'pending',
      extendedUntil: null,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      deletedAt: null,
    });
  });

  it('PASS updates employment status to active', async () => {
    await service.resolveProbation(actor, 'rev-1', { outcome: 'PASS' });
    expect(reviewEntity.pass).toHaveBeenCalledWith('hr-1');
    expect(employeeStatus.updateEmploymentStatus).toHaveBeenCalledWith('emp-1', 'active', 'hr-1', expect.anything());
  });

  it('FAIL creates exit case', async () => {
    await service.resolveProbation(actor, 'rev-1', { outcome: 'FAIL', notes: 'Underperforming' });
    expect(reviewEntity.fail).toHaveBeenCalled();
    expect(exitCases.create).toHaveBeenCalledWith(
      actor,
      'emp-1',
      expect.objectContaining({ exitReason: 'performance_failure' }),
    );
  });

  it('EXTEND uses extensionDays default', async () => {
    reviewEntity.toPersistence.mockReturnValueOnce({
      id: 'rev-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      probationStartDate: new Date('2026-04-01'),
      probationEndDate: new Date('2026-07-01'),
      outcome: 'pending',
      extendedUntil: null,
      notes: null,
      reviewedBy: null,
      reviewedAt: null,
      deletedAt: null,
    });
    reviewEntity.toPersistence.mockReturnValue({
      id: 'rev-1',
      employeeId: 'emp-1',
      companyId: 'co-1',
      probationStartDate: new Date('2026-04-01'),
      probationEndDate: new Date('2026-07-01'),
      outcome: 'extended',
      extendedUntil: new Date('2026-07-31'),
      notes: null,
      reviewedBy: 'hr-1',
      reviewedAt: new Date(),
      deletedAt: null,
    });

    await service.resolveProbation(actor, 'rev-1', { outcome: 'EXTEND', extensionDays: 30 });
    expect(reviewEntity.extend).toHaveBeenCalled();
    expect(probations.save).toHaveBeenCalledTimes(2);
  });

  it('bootstrapProbationReviewOnOnboarding creates pending review', async () => {
    const result = await service.bootstrapProbationReviewOnOnboarding(actor, {
      employeeId: 'emp-1',
      companyId: 'co-1',
      hireDate: new Date('2026-04-01'),
      probationEndDate: new Date('2026-07-01'),
      employmentStatus: 'probation',
    });
    expect(result).toBeTruthy();
    expect(probations.save).toHaveBeenCalled();
  });

  it('bootstrapProbationReviewOnOnboarding skips active employees', async () => {
    const result = await service.bootstrapProbationReviewOnOnboarding(actor, {
      employeeId: 'emp-1',
      companyId: 'co-1',
      hireDate: new Date('2026-04-01'),
      probationEndDate: null,
      employmentStatus: 'active',
    });
    expect(result).toBeNull();
    expect(probations.save).not.toHaveBeenCalled();
  });
});
