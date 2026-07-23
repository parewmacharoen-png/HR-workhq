import { FinalSettlementTelegramNotifier } from './final-settlement.notifier';

describe('FinalSettlementTelegramNotifier', () => {
  const gateway = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    employee: {
      findFirst: jest.fn().mockResolvedValue({ firstName: 'Som', lastName: 'Chai' }),
    },
    businessRoleAssignment: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'owner-1', role: 'owner' }]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'owner-1',
        scopeGrants: [{ scopeType: 'all', companyId: null }],
      }),
    },
    telegramAccount: {
      findMany: jest.fn().mockResolvedValue([{ id: 'tg-1', chatId: '123' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'tg-2', chatId: '456' }),
    },
  };

  let notifier: FinalSettlementTelegramNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new FinalSettlementTelegramNotifier(prisma as never, gateway as never);
  });

  it('notifies owner on submit', async () => {
    await notifier.notifySubmitted({
      companyId: 'co-1',
      settlementId: 'fs-1',
      employeeId: 'emp-1',
      netPayableAmount: 15000,
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('ส่งอนุมัติค่าจ้างสุดท้าย'),
    }));
  });

  it('notifies HR on approve', async () => {
    prisma.businessRoleAssignment.findMany.mockResolvedValue([
      { userId: 'sec-1', role: 'secretary' },
    ]);

    await notifier.notifyApproved({
      companyId: 'co-1',
      settlementId: 'fs-1',
      employeeId: 'emp-1',
      netPayableAmount: 15000,
    });

    expect(gateway.sendMessage).toHaveBeenCalled();
  });

  it('notifies employee on paid with amount', async () => {
    process.env.WORKHQ_WEB_URL = 'https://app.workhq.test';
    await notifier.notifyPaid({
      companyId: 'co-1',
      settlementId: 'fs-1',
      employeeId: 'emp-1',
      netPayableAmount: 15000,
      paidAt: '2026-06-24T10:00:00.000Z',
      summaryPath: '/me/final-settlement',
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('15,000.00'),
      replyMarkup: {
        inline_keyboard: [[{
          text: '📄 ดูสรุปค่าจ้างสุดท้าย',
          url: 'https://app.workhq.test/me/final-settlement',
        }]],
      },
    }));
    delete process.env.WORKHQ_WEB_URL;
  });
});
