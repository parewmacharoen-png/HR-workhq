import { AttendanceAlertService } from './attendance-alert.service';

describe('AttendanceAlertService (unit)', () => {
  const prisma = {
    company: { findFirst: jest.fn() },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    attendanceRecord: { findFirst: jest.fn() },
    attendanceReminder: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(),
    },
    employeeAssignment: { findFirst: jest.fn() },
  };
  const settings = {
    getRules: jest.fn().mockResolvedValue({
      shiftStartMinutes: 9 * 60,
      shiftEndMinutes: 21 * 60,
      checkInPreReminderMinutes: 15,
      checkInReminderMinutes: 30,
      checkInEscalationMinutes: 60,
      breakPreReminderMinutes: 5,
      breakReminderMinutes: 60,
      breakEscalationMinutes: 90,
      checkOutReminderMinutes: 30,
      checkOutEscalationMinutes: 120,
    }),
  };
  const notifier = {
    notifyEmployee: jest.fn(),
    notifyBigLeader: jest.fn(),
  };
  const audit = { record: jest.fn() };
  const dates = { now: jest.fn() };
  const dayContext = {
    getContext: jest.fn().mockResolvedValue({
      skipAttendanceAlerts: false,
    }),
  };
  const shiftAssignment = {
    resolveShiftWindow: jest.fn().mockResolvedValue({
      shift: { id: 's1', name: 'กะกลางวัน', startMinutes: 9 * 60, endMinutes: 18 * 60, crossesMidnight: false },
      shiftStartAt: new Date('2026-07-01T02:00:00.000Z'),
      shiftEndAt: new Date('2026-07-01T11:00:00.000Z'),
    }),
  };

  const service = new AttendanceAlertService(
    prisma as never,
    settings as never,
    notifier as never,
    audit as never,
    dates as never,
    dayContext as never,
    shiftAssignment as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('returns empty alerts dashboard when none sent', async () => {
    const result = await service.getAlertsToday('co-1');
    expect(result).toEqual({
      missingCheckIns: 0,
      missingBreakReturns: 0,
      missingCheckOuts: 0,
      items: [],
    });
  });

  it('skips company run when no employees', async () => {
    await service.runForCompany('co-1', new Date('2026-06-24T03:00:00.000Z'));
    expect(notifier.notifyEmployee).not.toHaveBeenCalled();
  });

  it('does not catch up stale pre-checkin and late alerts hours after shift start', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', firstName: 'Test', lastName: 'User' },
    ]);
    prisma.attendanceRecord.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue({ name: 'HH' });

    // 16:34 Bangkok = 09:34 UTC
    await service.runForCompany('co-1', new Date('2026-07-02T09:34:00.000Z'));

    expect(notifier.notifyEmployee).not.toHaveBeenCalled();
  });

  it('sends pre-checkin reminder within the scheduled minute window', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', firstName: 'Test', lastName: 'User' },
    ]);
    prisma.attendanceRecord.findFirst.mockResolvedValue(null);
    prisma.company.findFirst.mockResolvedValue({ name: 'HH' });

    // 08:45 Bangkok = 01:45 UTC
    await service.runForCompany('co-1', new Date('2026-07-02T01:45:00.000Z'));

    expect(notifier.notifyEmployee).toHaveBeenCalledWith(
      'emp-1',
      'checkin_pre_reminder',
      expect.objectContaining({ shiftStartMinutes: 9 * 60 }),
    );
  });

  it('sends break pre-reminder 5 minutes before the break limit', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', firstName: 'Test', lastName: 'User' },
    ]);
    prisma.company.findFirst.mockResolvedValue({ name: 'HH' });
    prisma.attendanceRecord.findFirst.mockResolvedValue({
      checkInAt: new Date('2026-07-06T10:00:00.000Z'),
      checkOutAt: null,
      breaks: [{ breakStartAt: new Date('2026-07-06T12:40:00.000Z'), breakEndAt: null }],
    });

    // 20:35 Bangkok = 13:35 UTC — 55 minutes after 19:40 break start
    await service.runForCompany('co-1', new Date('2026-07-06T13:35:00.000Z'));

    expect(notifier.notifyEmployee).toHaveBeenCalledWith(
      'emp-1',
      'break_return_pre_reminder',
      expect.objectContaining({ minutesRemaining: 5 }),
    );
    expect(notifier.notifyEmployee).not.toHaveBeenCalledWith(
      'emp-1',
      'missing_break_return',
      expect.anything(),
    );
  });

  it('sends break limit reminder when the configured break duration is reached', async () => {
    prisma.employee.findMany.mockResolvedValue([
      { id: 'emp-1', firstName: 'Test', lastName: 'User' },
    ]);
    prisma.company.findFirst.mockResolvedValue({ name: 'HH' });
    prisma.attendanceRecord.findFirst.mockResolvedValue({
      checkInAt: new Date('2026-07-06T10:00:00.000Z'),
      checkOutAt: null,
      breaks: [{ breakStartAt: new Date('2026-07-06T12:40:00.000Z'), breakEndAt: null }],
    });

    // 20:40 Bangkok = 13:40 UTC — 60 minutes after break start
    await service.runForCompany('co-1', new Date('2026-07-06T13:40:00.000Z'));

    expect(notifier.notifyEmployee).toHaveBeenCalledWith(
      'emp-1',
      'missing_break_return',
      expect.objectContaining({ breakMinutes: 60 }),
    );
  });
});
