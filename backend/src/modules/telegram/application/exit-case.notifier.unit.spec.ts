import { ExitCaseTelegramNotifier } from './exit-case.notifier';

describe('ExitCaseTelegramNotifier', () => {
  const gateway = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    employee: {
      findFirst: jest.fn().mockResolvedValue({ firstName: 'A', lastName: 'B' }),
    },
    businessRoleAssignment: {
      findMany: jest.fn().mockResolvedValue([{ userId: 'leader-1', role: 'owner' }]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        id: 'leader-1',
        scopeGrants: [{ scopeType: 'all', companyId: null }],
      }),
    },
    telegramAccount: {
      findMany: jest.fn().mockResolvedValue([{ id: 'tg-1', chatId: '123' }]),
      findFirst: jest.fn().mockResolvedValue({ id: 'tg-2', chatId: '456' }),
    },
  };

  let notifier: ExitCaseTelegramNotifier;

  beforeEach(() => {
    jest.clearAllMocks();
    notifier = new ExitCaseTelegramNotifier(prisma as never, gateway as never);
  });

  it('notifies leaders and employee on new exit case', async () => {
    await notifier.notifyNewExitCase({
      companyId: 'co-1',
      exitCaseId: 'case-1',
      employeeId: 'emp-1',
      exitType: 'termination',
      effectiveTerminationDate: '2026-06-30',
    });

    expect(gateway.sendMessage).toHaveBeenCalled();
    expect(gateway.sendMessage.mock.calls.some((call) => String(call[0].text).includes('เคสลาออกใหม่'))).toBe(true);
  });

  it('notifies leaders about pending checklist items', async () => {
    await notifier.notifyChecklistPending({
      companyId: 'co-1',
      exitCaseId: 'case-1',
      employeeId: 'emp-1',
      exitType: 'resignation',
      effectiveTerminationDate: '2026-06-30',
      pendingItems: ['Return keys'],
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(expect.objectContaining({
      text: expect.stringContaining('Return keys'),
    }));
  });

  it('notifies leaders and employee when exit case cancelled', async () => {
    await notifier.notifyExitCancelled({
      companyId: 'co-1',
      exitCaseId: 'case-1',
      employeeId: 'emp-1',
      exitType: 'termination',
      effectiveTerminationDate: '2026-06-30',
      cancellationReason: 'Opened in error',
    });

    expect(gateway.sendMessage.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(gateway.sendMessage.mock.calls.some((call) => String(call[0].text).includes('Opened in error'))).toBe(true);
  });
});
