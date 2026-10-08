import { AbsenceFlagJob } from './absence-flag.job';

describe('AbsenceFlagJob', () => {
  const prisma = {
    employeeAssignment: {
      findMany: jest.fn(),
    },
    attendanceRecord: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const absences = {
    findForEmployeeDate: jest.fn().mockResolvedValue(null),
    save: jest.fn(),
  };
  const dayContext = {
    getContext: jest.fn().mockResolvedValue({
      dayType: 'workday',
      skipAbsenceFlag: false,
    }),
  };
  const ledger = { recordOffDay: jest.fn(), recordAbsenceDay: jest.fn() };
  const shifts = {
    resolveShiftWindow: jest.fn().mockResolvedValue({
      shift: { startMinutes: 9 * 60, endMinutes: 18 * 60 },
    }),
  };
  const settings = {
    getRules: jest.fn().mockResolvedValue({
      checkInEscalationMinutes: 60,
    }),
  };

  const absenceAutoWaive = {
    syncForWorkDay: jest.fn().mockResolvedValue('unchanged'),
    shouldHoldAbsenceReview: jest.fn().mockResolvedValue(false),
  };

  const job = new AbsenceFlagJob(
    prisma as never,
    absences as never,
    dayContext as never,
    ledger as never,
    shifts as never,
    settings as never,
    absenceAutoWaive as never,
  );

  const companyAssignments = [
    {
      employeeId: 'emp-1',
      employee: {
        id: 'emp-1',
        position: 'Staff',
        employmentStatus: 'active',
        hireDate: new Date('2020-01-01T00:00:00.000Z'),
        terminationDate: null,
      },
    },
  ];
  let ownership: Array<{ employeeId: string; companyId: string; isPrimaryCompany: boolean }>;

  beforeEach(() => {
    jest.clearAllMocks();
    ownership = [{ employeeId: 'emp-1', companyId: 'co-1', isPrimaryCompany: true }];
    prisma.employeeAssignment.findMany.mockImplementation((args: { select?: unknown }) =>
      Promise.resolve(args.select ? ownership : companyAssignments));
  });

  it('skips flagging before shift escalation window', async () => {
    const result = await job.runForCompany(
      'co-1',
      new Date('2026-07-02T00:00:00.000Z'),
      new Date('2026-07-02T02:30:00.000Z'), // 09:30 Bangkok — before 10:00 flag time
    );
    expect(result.flaggedCount).toBe(0);
    expect(absences.save).not.toHaveBeenCalled();
  });

  it('flags absence after escalation window with no check-in', async () => {
    const result = await job.runForCompany(
      'co-1',
      new Date('2026-07-02T00:00:00.000Z'),
      new Date('2026-07-02T03:30:00.000Z'), // 10:30 Bangkok — after 10:00
    );
    expect(result.flaggedCount).toBe(1);
    expect(absences.save).toHaveBeenCalled();
  });

  it('flags a multi-company employee only in their primary company', async () => {
    ownership = [
      { employeeId: 'emp-1', companyId: 'co-1', isPrimaryCompany: false },
      { employeeId: 'emp-1', companyId: 'co-2', isPrimaryCompany: true },
    ];
    const workDate = new Date('2026-07-02T00:00:00.000Z');
    const asOf = new Date('2026-07-02T03:30:00.000Z');

    const other = await job.runForCompany('co-1', workDate, asOf);
    expect(other.flaggedCount).toBe(0);
    expect(ledger.recordOffDay).not.toHaveBeenCalled();
    expect(absences.save).not.toHaveBeenCalled();

    const owner = await job.runForCompany('co-2', workDate, asOf);
    expect(owner.flaggedCount).toBe(1);
  });
});
