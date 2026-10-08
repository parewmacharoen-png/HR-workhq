import { CompensationReviewTelegramNotifier } from './compensation-review.notifier';

describe('CompensationReviewTelegramNotifier (unit)', () => {
  const gateway = { sendMessage: jest.fn().mockResolvedValue(1) };
  const prisma = {
    businessRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    telegramAccount: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    company: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const approvalNotifier = {
    notifyPendingApproval: jest.fn(),
    notifyCustomApproval: jest.fn().mockResolvedValue(undefined),
  };
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
    prisma.company.findFirst.mockResolvedValue({ name: 'SB Company' });

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

    // Salary submissions are routed through the shared custom-approval flow
    // (inline approve/reject buttons) rather than a plain notice message.
    expect(approvalNotifier.notifyCustomApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewType: 'salary_review',
        reviewId: 'rev-1',
        approverUserIds: ['owner-1'],
        display: expect.objectContaining({
          requestTypeLabel: 'อนุมัติปรับเงินเดือน',
          requesterName: 'Test User',
          companyName: 'SB Company',
        }),
      }),
    );
    expect(gateway.sendMessage).not.toHaveBeenCalled();
  });
});
