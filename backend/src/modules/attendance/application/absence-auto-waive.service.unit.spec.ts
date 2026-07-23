import { AbsenceAutoWaiveService } from './absence-auto-waive.service';
import { AbsenceFlagJob } from './absence-flag.job';

describe('AbsenceAutoWaiveService', () => {
  const absences = {
    findForEmployeeDate: jest.fn(),
    save: jest.fn(),
  };
  const prisma = {
    attendanceRecord: { findFirst: jest.fn().mockResolvedValue(null) },
    attendanceCorrection: { findFirst: jest.fn().mockResolvedValue(null) },
    requestInstance: { findMany: jest.fn().mockResolvedValue([]) },
  };
  const audit = { record: jest.fn() };
  const dates = { now: jest.fn(() => new Date('2026-07-06T14:30:00.000Z')) };

  const service = new AbsenceAutoWaiveService(
    absences as never,
    prisma as never,
    audit as never,
    dates as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('waives flagged absence when employee checked in', async () => {
    const waive = jest.fn();
    absences.findForEmployeeDate.mockResolvedValue({
      id: 'abs-1',
      status: 'flagged',
      employeeId: 'emp-1',
      companyId: 'co-1',
      workDate: new Date('2026-07-06T00:00:00.000Z'),
      waive,
      toPersistence: () => ({ waiveReason: null }),
    });
    prisma.attendanceRecord.findFirst.mockResolvedValue({ id: 'att-1' });

    const workDate = new Date('2026-07-06T00:00:00.000Z');
    const result = await service.syncForWorkDay('emp-1', 'co-1', workDate);

    expect(result).toBe('waived');
    expect(waive).toHaveBeenCalled();
    expect(absences.save).toHaveBeenCalled();
  });

  it('waives flagged absence when pending check-in correction exists', async () => {
    const waive = jest.fn();
    absences.findForEmployeeDate.mockResolvedValue({
      id: 'abs-1',
      status: 'flagged',
      employeeId: 'emp-1',
      companyId: 'co-1',
      workDate: new Date('2026-07-06T00:00:00.000Z'),
      waive,
      toPersistence: () => ({ waiveReason: null }),
    });
    prisma.attendanceCorrection.findFirst.mockResolvedValue({ id: 'corr-1' });

    const result = await service.syncForWorkDay(
      'emp-1',
      'co-1',
      new Date('2026-07-06T00:00:00.000Z'),
    );

    expect(result).toBe('waived');
    expect(waive).toHaveBeenCalled();
  });

  it('restores flagged absence when pending correction is gone', async () => {
    const restoreFlagged = jest.fn();
    absences.findForEmployeeDate.mockResolvedValue({
      id: 'abs-1',
      status: 'waived',
      employeeId: 'emp-1',
      companyId: 'co-1',
      workDate: new Date('2026-07-06T00:00:00.000Z'),
      restoreFlagged,
      toPersistence: () => ({ waiveReason: 'มีคำขอแก้ไขเวลาเข้างาน — รออนุมัติ' }),
    });

    const result = await service.syncForWorkDay(
      'emp-1',
      'co-1',
      new Date('2026-07-06T00:00:00.000Z'),
    );

    expect(result).toBe('restored');
    expect(restoreFlagged).toHaveBeenCalled();
    expect(absences.save).toHaveBeenCalled();
  });
});

describe('AbsenceFlagJob auto-waive', () => {
  const prisma = {
    employeeAssignment: {
      findMany: jest.fn().mockResolvedValue([
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
      ]),
    },
    attendanceRecord: {
      findFirst: jest.fn().mockResolvedValue({ checkInAt: new Date('2026-07-06T02:00:00.000Z') }),
    },
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
    syncForWorkDay: jest.fn().mockResolvedValue('waived'),
    shouldHoldAbsenceReview: jest.fn().mockResolvedValue(true),
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

  beforeEach(() => jest.clearAllMocks());

  it('skips flagging when attendance evidence already exists', async () => {
    const result = await job.runForCompany(
      'co-1',
      new Date('2026-07-06T00:00:00.000Z'),
      new Date('2026-07-06T03:30:00.000Z'),
    );

    expect(result.flaggedCount).toBe(0);
    expect(absenceAutoWaive.syncForWorkDay).toHaveBeenCalled();
    expect(absences.save).not.toHaveBeenCalled();
  });
});
