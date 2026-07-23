// ============================================================================
// modules/telegram/application/probation-review.notifier.unit.spec.ts
// EMP-010b — probation reminder inline actions.
// ============================================================================

import { ProbationReviewTelegramNotifier } from './probation-review.notifier';

describe('ProbationReviewTelegramNotifier (unit)', () => {
  const gateway = { sendMessage: jest.fn().mockResolvedValue(1) };
  const prisma = {
    employee: { findFirst: jest.fn().mockResolvedValue({ firstName: 'Test', lastName: 'User' }) },
    businessRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    telegramAccount: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const notifier = new ProbationReviewTelegramNotifier(prisma as never, gateway as never);

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends leader reminder with inline PASS/EXTEND/FAIL keyboard', async () => {
    prisma.businessRoleAssignment.findMany.mockResolvedValue([
      { userId: 'leader-1', role: 'big_leader' },
    ]);
    prisma.telegramAccount.findMany.mockResolvedValue([
      { id: 'tg-1', chatId: BigInt(123), userId: 'leader-1' },
    ]);
    prisma.user.findFirst.mockResolvedValue({
      id: 'leader-1',
      scopeGrants: [{ scopeType: 'company', companyId: 'co-1' }],
    });
    prisma.telegramAccount.findFirst.mockResolvedValue(null);

    await notifier.notifyReminder('co-1', {
      companyId: 'co-1',
      employeeId: 'emp-1',
      employeeName: 'Test User',
      department: 'hr',
      position: 'staff',
      probationEndDate: '2026-07-01',
      daysRemaining: 7,
      reviewId: 'rev-1',
    });

    expect(gateway.sendMessage).toHaveBeenCalled();
    const leaderCall = gateway.sendMessage.mock.calls.find(
      (call) => call[0].messageType === 'probation_review_leader',
    );
    expect(leaderCall?.[0].replyMarkup).toEqual({
      inline_keyboard: [[
        { text: '✅ PASS', callback_data: 'probation:pass:rev-1' },
        { text: '📅 EXTEND 30d', callback_data: 'probation:extend:rev-1' },
        { text: '❌ FAIL', callback_data: 'probation:fail:rev-1' },
      ]],
    });
  });
});
