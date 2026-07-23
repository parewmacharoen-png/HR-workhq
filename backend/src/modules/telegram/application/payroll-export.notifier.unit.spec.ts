import { PayrollExportTelegramNotifier } from './payroll-export.notifier';

describe('PayrollExportTelegramNotifier', () => {
  const prisma = {
    payrollCycle: { findUnique: jest.fn() },
    businessRoleAssignment: { findMany: jest.fn() },
    user: { findFirst: jest.fn() },
    telegramAccount: { findMany: jest.fn() },
  };
  const gateway = { sendMessage: jest.fn().mockResolvedValue(undefined) };

  let notifier: PayrollExportTelegramNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new PayrollExportTelegramNotifier(prisma as never, gateway as never);
  });

  it('notifies scoped HR users when export is created', async () => {
    prisma.payrollCycle.findUnique.mockResolvedValue({
      periodStart: new Date('2026-06-01'),
      periodEnd: new Date('2026-06-30'),
    });
    prisma.businessRoleAssignment.findMany.mockResolvedValue([
      { userId: 'owner-1', role: 'owner' },
      { userId: 'sec-1', role: 'secretary' },
    ]);
    prisma.user.findFirst
      .mockResolvedValueOnce({ scopeGrants: [{ scopeType: 'all', companyId: null }] })
      .mockResolvedValueOnce({
        scopeGrants: [{ scopeType: 'company', companyId: 'co-1' }],
      });
    prisma.telegramAccount.findMany.mockResolvedValue([
      { id: 'tg-1', chatId: '100', userId: 'owner-1' },
    ]);

    await notifier.notifyExportCreated({
      companyId: 'co-1',
      batchId: 'batch-1',
      cycleId: 'cycle-1',
      includedCount: 3,
      exceptionCount: 1,
      totalNetPayAmount: 90000,
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 100,
        messageType: 'payroll_export_notice',
      }),
    );
  });
});
