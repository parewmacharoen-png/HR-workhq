import { CompensationReviewTelegramNotifier } from './compensation-review.notifier';

describe('CompensationReviewTelegramNotifier (unit)', () => {
  const gateway = { sendMessage: jest.fn().mockResolvedValue(1) };
  const prisma = {
    businessRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    telegramAccount: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const approvalNotifier = { notifyPendingApproval: jest.fn() };
  const notifier = new CompensationReviewTelegramNotifier(prisma as never, gateway as never, approvalNotifier as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('notifies owners on salary submission', async () => {
    prisma.businessRoleAssignment.findMany.mockResolvedValue([
      { userId: 'owner-1', role: 'owner' },
    ]);
    prisma.user.findFirst.mockResolvedValue({
      id: 'owner-1',
      scopeGrants: [{ scopeType: 'all', companyId: null }],
    });
    prisma.telegramAccount.findMany.mockResolvedValue([
      { id: 'tg-1', chatId: BigInt(123), userId: 'owner-1' },
    ]);

    await notifier.notifySalarySubmitted({
      id: 'rev-1',
      companyId: 'co-1',
      employeeId: 'emp-1',
      employeeName: 'Test User',
      employeeCode: 'E001',
      currentSalary: 30000,
      proposedSalary: 33000,
      increaseAmount: 3000,
      increasePercent: 10,
      reason: 'Annual review',
      effectiveDate: '2026-07-01',
      status: 'pending_approval',
      requestedBy: 'u1',
      approvedBy: null,
      rejectedBy: null,
      rejectedAt: null,
      appliedAt: null,
      createdAt: '2026-06-01',
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 123,
        messageType: 'compensation_review_notice',
        text: expect.stringContaining('ส่งอนุมัติปรับเงินเดือน'),
      }),
    );
  });
});
