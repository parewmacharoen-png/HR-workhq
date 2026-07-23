// ============================================================================
// modules/telegram/application/employee-recognition.notifier.unit.spec.ts
// ============================================================================

import { EmployeeRecognitionNotifier } from './employee-recognition.notifier';

describe('EmployeeRecognitionNotifier (unit)', () => {
  const gateway = { sendMessage: jest.fn().mockResolvedValue(undefined) };
  const prisma = {
    telegramAccount: {
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
    },
    businessRoleAssignment: { findMany: jest.fn().mockResolvedValue([]) },
    user: { findFirst: jest.fn() },
    employee: { findFirst: jest.fn() },
    employeeAssignment: { findFirst: jest.fn() },
  };

  const notifier = new EmployeeRecognitionNotifier(prisma as never, gateway as never);

  const employee = {
    id: 'emp-1',
    firstName: 'Somchai',
    lastName: 'Test',
    department: 'HR',
    position: 'Officer',
    dateOfBirth: new Date('1992-08-06'),
    hireDate: new Date('2020-06-23'),
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends birthday message to employee and leaders', async () => {
    prisma.telegramAccount.findFirst.mockResolvedValue({ id: 'tg-1', chatId: '12345' });
    prisma.businessRoleAssignment.findMany.mockResolvedValue([
      { userId: 'owner-1', role: 'owner' },
    ]);
    prisma.user.findFirst.mockResolvedValue({
      id: 'owner-1',
      scopeGrants: [{ scopeType: 'all', companyId: null }],
    });
    prisma.telegramAccount.findMany.mockResolvedValue([{ id: 'tg-2', chatId: '99999', userId: 'owner-1' }]);

    await notifier.notifyBirthday('co-1', { employee });

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 12345,
        text: expect.stringContaining('สุขสันต์วันเกิด'),
      }),
    );
    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 99999,
        text: expect.stringContaining('วันนี้เป็นวันเกิดของ'),
      }),
    );
  });

  it('sends anniversary message to employee and leaders', async () => {
    prisma.telegramAccount.findFirst.mockResolvedValue({ id: 'tg-1', chatId: '12345' });
    prisma.businessRoleAssignment.findMany.mockResolvedValue([
      { userId: 'sec-1', role: 'secretary' },
    ]);
    prisma.user.findFirst.mockResolvedValue({
      id: 'sec-1',
      scopeGrants: [{ scopeType: 'company', companyId: 'co-1' }],
    });
    prisma.telegramAccount.findMany.mockResolvedValue([{ id: 'tg-2', chatId: '88888', userId: 'sec-1' }]);

    await notifier.notifyAnniversary('co-1', { employee, anniversaryYears: 5 });

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 12345,
        text: expect.stringContaining('วันครบรอบการทำงาน'),
      }),
    );
    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 88888,
        text: expect.stringContaining('ครบ <b>5</b> ปี'),
      }),
    );
  });

  it('notifies employee and leaders when gift is recorded', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.telegramAccount.findFirst.mockResolvedValue({ id: 'tg-1', chatId: '12345' });
    prisma.businessRoleAssignment.findMany.mockResolvedValue([
      { userId: 'owner-1', role: 'owner' },
    ]);
    prisma.user.findFirst.mockResolvedValue({
      id: 'owner-1',
      scopeGrants: [{ scopeType: 'all', companyId: null }],
    });
    prisma.telegramAccount.findMany.mockResolvedValue([{ id: 'tg-2', chatId: '99999', userId: 'owner-1' }]);

    await notifier.notifyGiftRecorded({
      companyId: 'co-1',
      employeeId: 'emp-1',
      recognitionType: 'BIRTHDAY_GIFT',
      recognitionDate: new Date('2026-06-23'),
      notes: 'Gift box',
    });

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 12345,
        text: expect.stringContaining('บันทึกของขวัญวันเกิดแล้ว'),
      }),
    );
  });

  it('broadcasts company-wide birthday announcement', async () => {
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.telegramAccount.findMany.mockResolvedValue([
      { id: 'tg-1', chatId: '11111', user: { employeeId: 'emp-2' } },
    ]);
    prisma.employeeAssignment.findFirst.mockResolvedValue({ companyId: 'co-1' });

    await notifier.broadcastCompanyBirthdayAnnouncement('co-1', 'emp-1');

    expect(gateway.sendMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        chatId: 11111,
        text: expect.stringContaining('ประกาศวันเกิด'),
      }),
    );
  });
});
