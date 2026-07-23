import { EmployeeOnboardingApprovalService } from './employee-onboarding-approval.service';

describe('EmployeeOnboardingApprovalService', () => {
  const actor = { userId: 'user-1', roles: [], impersonatorUserId: null, companyId: 'co-1' } as const;

  function buildService(overrides: {
    identity?: Record<string, unknown> | null;
    submission?: Record<string, unknown> | null;
    invite?: Record<string, unknown> | null;
  } = {}) {
    const prisma = {
      telegramIdentity: {
        findFirst: jest.fn().mockResolvedValue(overrides.identity ?? null),
      },
      employeeSelfOnboardingSubmission: {
        findUnique: jest.fn().mockResolvedValue(overrides.submission ?? null),
      },
      employeeTelegramInvite: {
        findUnique: jest.fn().mockResolvedValue(overrides.invite ?? null),
        findFirst: jest.fn().mockResolvedValue(overrides.invite ?? null),
      },
      $transaction: jest.fn(async (fn: (tx: unknown) => Promise<void>) => fn({})),
    };

    const svc = new EmployeeOnboardingApprovalService(
      prisma as never,
      { record: jest.fn() } as never,
      { approveRegistration: jest.fn(), promotePendingToActive: jest.fn(), rejectRegistration: jest.fn() } as never,
      { recordIfNew: jest.fn() } as never,
    );

    return { svc, prisma };
  }

  it('isAlreadyApproved returns true when identity active and invite used', async () => {
    const { svc } = buildService({
      identity: { status: 'ACTIVE' },
      submission: { status: 'approved' },
      invite: { status: 'used' },
    });

    const result = await svc.isAlreadyApproved({
      employeeId: 'emp-1',
      telegramUserId: 123,
      selfOnboardingSubmissionId: 'sub-1',
      invitationId: 'inv-1',
    });

    expect(result).toBe(true);
  });

  it('processApproved returns existing result without duplicate writes when already approved', async () => {
    const { svc, prisma } = buildService({
      identity: { status: 'ACTIVE' },
      submission: { status: 'approved' },
      invite: { status: 'used' },
    });

    const result = await svc.processApproved(actor, {
      employeeId: 'emp-1',
      telegramUserId: 123,
      selfOnboardingSubmissionId: 'sub-1',
      invitationId: 'inv-1',
      requestInstanceId: 'req-1',
    });

    expect(result.alreadyDone).toBe(true);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('isAlreadyRejected returns true when submission already rejected', async () => {
    const { svc } = buildService({
      submission: { status: 'rejected' },
    });

    const result = await svc.isAlreadyRejected({
      employeeId: 'emp-1',
      telegramUserId: 123,
      selfOnboardingSubmissionId: 'sub-1',
    });

    expect(result).toBe(true);
  });

  it('processRejected is no-op when already rejected', async () => {
    const identities = { rejectRegistration: jest.fn(), promotePendingToActive: jest.fn() };
    const timeline = { recordIfNew: jest.fn() };
    const prisma = {
      telegramIdentity: { findFirst: jest.fn(), updateMany: jest.fn() },
      employeeSelfOnboardingSubmission: {
        findUnique: jest.fn().mockResolvedValue({ status: 'rejected' }),
        updateMany: jest.fn(),
      },
      employeeTelegramInvite: { findUnique: jest.fn(), findFirst: jest.fn(), updateMany: jest.fn() },
      requestInstance: { findUnique: jest.fn() },
    };
    const svc = new EmployeeOnboardingApprovalService(
      prisma as never,
      { record: jest.fn() } as never,
      identities as never,
      timeline as never,
    );

    await svc.processRejected(actor, {
      employeeId: 'emp-1',
      telegramUserId: 123,
      selfOnboardingSubmissionId: 'sub-1',
    }, 'reason');

    expect(prisma.employeeTelegramInvite.updateMany).not.toHaveBeenCalled();
  });
});
