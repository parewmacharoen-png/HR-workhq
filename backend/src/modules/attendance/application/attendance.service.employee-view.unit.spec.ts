import { AttendanceService } from './attendance.service';

describe('AttendanceService employee view', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  function buildService(overrides: {
    todayRecord?: Record<string, unknown> | null;
    monthRecords?: Array<Record<string, unknown>>;
    historyRecords?: Array<Record<string, unknown>>;
    monthOt?: Array<Record<string, unknown>>;
    historyOt?: Array<Record<string, unknown>>;
    absences?: Array<Record<string, unknown>>;
    leaves?: Array<Record<string, unknown>>;
    latest?: Record<string, unknown> | null;
    employee?: Record<string, unknown> | null;
    shift?: Record<string, unknown> | null;
  }) {
    const today = new Date('2026-06-24T00:00:00.000Z');
    const time = {
      workDate: jest.fn().mockReturnValue(today),
      workDateString: jest.fn().mockReturnValue('2026-06-24'),
      now: jest.fn().mockReturnValue(new Date('2026-06-24T10:00:00.000Z')),
    };
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue(overrides.employee ?? { workCategory: 'office' }),
      },
      adminCommissionEmployeeProfile: {
        findFirst: jest.fn().mockResolvedValue(overrides.shift ?? { defaultShift: 'day' }),
      },
      attendanceRecord: {
        findFirst: jest.fn()
          .mockResolvedValueOnce(overrides.todayRecord ?? null)
          .mockResolvedValue(overrides.latest ?? null),
        findMany: jest.fn()
          .mockResolvedValueOnce(overrides.monthRecords ?? [])
          .mockResolvedValueOnce(overrides.historyRecords ?? []),
      },
      overtimeRecord: {
        findMany: jest.fn()
          .mockResolvedValueOnce(overrides.monthOt ?? [])
          .mockResolvedValueOnce(overrides.historyOt ?? []),
      },
      absenceRecord: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn()
          .mockResolvedValueOnce(overrides.absences ?? [])
          .mockResolvedValueOnce(overrides.absences ?? []),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue(overrides.leaves ?? []),
      },
      monthlyOffRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      breakRecord: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };

    const service = new AttendanceService(
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      prisma as never,
      {} as never,
      { assertEmployeeSelfOrCompany: jest.fn() } as never,
      { getRules: jest.fn().mockResolvedValue({ breakMinutes: 60 }) } as never,
      {} as never,
      {} as never,
      time as never,
      { hasApprovedLeaveForEmployeeOnDate: jest.fn().mockResolvedValue(false) } as never,
    );

    return { service, prisma };
  }

  it('maps summary and history from attendance records', async () => {
    const { service } = buildService({
      todayRecord: {
        checkInAt: new Date('2026-06-24T01:00:00.000Z'),
        checkOutAt: null,
      },
      monthRecords: [{
        checkInAt: new Date('2026-06-24T01:00:00.000Z'),
        checkOutAt: null,
        lateMinutes: 5,
        workedMinutes: 450,
      }],
      historyRecords: [{
        id: 'att-1',
        workDate: new Date('2026-06-24T00:00:00.000Z'),
        checkInAt: new Date('2026-06-24T01:00:00.000Z'),
        checkOutAt: new Date('2026-06-24T10:00:00.000Z'),
        lateMinutes: 5,
        workedMinutes: 480,
        status: 'present',
      }],
      monthOt: [{ otHours: 2 }],
      historyOt: [{ workDate: new Date('2026-06-24T00:00:00.000Z'), otHours: 2 }],
      latest: {
        checkInAt: new Date('2026-06-24T01:00:00.000Z'),
        checkOutAt: new Date('2026-06-24T10:00:00.000Z'),
      },
    });

    const result = await service.getEmployeeAttendanceView(actor, 'emp-1', 'co-1');
    expect(result.summary.todayStatus).toBe('working');
    expect(result.summary.lateCountMonth).toBe(1);
    expect(result.summary.otHoursMonth).toBe(2);
    expect(result.history[0].status).toBe('late');
    expect(result.history[0].workedHours).toBe(8);
  });
});
