import { TelegramApprovalNotifier } from './telegram-approval.notifier';

describe('TelegramApprovalNotifier (unit)', () => {
  const gateway = {
    sendMessage: jest.fn().mockResolvedValue(1),
    editMessageText: jest.fn().mockResolvedValue(true),
    editMessageReplyMarkup: jest.fn().mockResolvedValue(true),
  };
  const prisma = {
    user: { findFirst: jest.fn() },
    telegramAccount: { findFirst: jest.fn() },
    salaryReview: { findFirst: jest.fn() },
    employeeAssignment: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
  };
  const context = {
    loadForInstance: jest.fn().mockResolvedValue({
      requestTypeLabel: 'คำขอลา',
      requesterName: 'Test User',
      companyName: 'Acme Co',
      teamName: 'Team A',
      createdAt: '2026-06-24 09:00',
      keyDetails: '3 วัน',
      workflowType: 'leave_request',
    }),
    resolveWorkflowType: jest.fn().mockResolvedValue('leave_request'),
  };
  const approvalNotifications = { registerHandler: jest.fn() };

  const notifier = new TelegramApprovalNotifier(
    prisma as never,
    gateway as never,
    context as never,
    approvalNotifications as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('registers as approval notification handler on init', () => {
    notifier.onModuleInit();
    expect(approvalNotifications.registerHandler).toHaveBeenCalledWith(notifier);
  });

  it('sends standardized approval message with inline keyboard', async () => {
    prisma.user.findFirst.mockResolvedValue({ employeeId: 'emp-1' });
    prisma.telegramAccount.findFirst.mockResolvedValue({ id: 'tg-1', chatId: BigInt(999) });

    await notifier.onApprovalRequested({
      workflowInstanceId: 'wf-1',
      workflowType: 'leave_request',
      entityType: 'leave',
      entityId: 'leave-1',
      companyId: 'co-1',
      approverUserIds: ['user-1'],
      submitterUserId: 'user-2',
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 999,
        messageType: 'approval_request',
        text: expect.stringContaining('📋'),
        replyMarkup: expect.objectContaining({
          inline_keyboard: expect.arrayContaining([
            expect.arrayContaining([
              expect.objectContaining({ text: '✅ อนุมัติ' }),
              expect.objectContaining({ text: '❌ ไม่อนุมัติ' }),
            ]),
            expect.arrayContaining([
              expect.objectContaining({ text: '🔎 ดูรายละเอียด' }),
            ]),
          ]),
        }),
      }),
    );
  });

  it('notifies requester on terminal rejection', async () => {
    prisma.user.findFirst.mockResolvedValue({ employeeId: 'emp-2' });
    prisma.telegramAccount.findFirst.mockResolvedValue({ id: 'tg-2', chatId: BigInt(888) });

    await notifier.onApprovalAction({
      event: 'approval_rejected',
      workflowInstanceId: 'wf-1',
      actorUserId: 'approver-1',
      entityType: 'leave',
      entityId: 'leave-1',
      companyId: 'co-1',
      submitterUserId: 'user-2',
      comment: 'ไม่เหมาะสม',
      terminalStatus: 'rejected',
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 888,
        messageType: 'approval_outcome',
        text: expect.stringContaining('ไม่อนุมัติ'),
      }),
    );
  it('edits custom approval message after resolve', async () => {
    prisma.salaryReview.findFirst.mockResolvedValue({
      employeeId: 'emp-1',
      companyId: 'co-1',
      currentSalary: 0,
      proposedSalary: 11000,
      effectiveDate: new Date('2026-07-25'),
      createdAt: new Date('2026-07-02T12:31:32.517Z'),
      employee: { firstName: 'chatphat', lastName: 'choti', nickname: null },
      company: { name: 'SB Company' },
    });
    prisma.employeeAssignment.findFirst.mockResolvedValue({
      company: { name: 'SB Company' },
      team: { name: 'Team A' },
    });
    prisma.employee.findFirst.mockResolvedValue({ position: 'Staff' });

    const ok = await notifier.editResolvedCustomApprovalMessage(
      123,
      456,
      'salary_review',
      'review-1',
      'approved',
    );

    expect(ok).toBe(true);
    expect(gateway.editMessageText).toHaveBeenCalledWith(
      123,
      456,
      expect.stringContaining('อนุมัติแล้ว'),
    );
    expect(gateway.editMessageReplyMarkup).toHaveBeenCalledWith(
      123,
      456,
      { inline_keyboard: [] },
    );
  });
});
