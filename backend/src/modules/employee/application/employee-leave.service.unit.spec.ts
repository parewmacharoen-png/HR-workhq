import { EmployeeLeaveService } from './employee-leave.service';

describe('EmployeeLeaveService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  function buildService(overrides: {
    leaveBalances?: Array<Record<string, unknown>>;
    leaveTypes?: Array<Record<string, unknown>>;
    requests?: Array<Record<string, unknown>>;
    monthlyOff?: Array<Record<string, unknown>>;
    actions?: Array<Record<string, unknown>>;
  }) {
    const leaveService = {
      leaveAffectedDates: jest.fn((start: Date, end: Date) => {
        const dates: string[] = [];
        const cursor = new Date(start);
        while (cursor <= end) {
          dates.push(cursor.toISOString().slice(0, 10));
          cursor.setUTCDate(cursor.getUTCDate() + 1);
        }
        return dates;
      }),
      updateLeaveRequest: jest.fn().mockResolvedValue({}),
      deleteLeaveRequest: jest.fn().mockResolvedValue(undefined),
    };
    const leaveSettings = {
      getRules: jest.fn().mockResolvedValue({
        defaultLeaveNoticeDays: 7,
        emergencyLeaveDaysPerHalfYear: 4,
      }),
    };
    const leaveTypes = overrides.leaveTypes ?? [
      { id: 'lt-emergency', code: 'emergency', name: 'ลากรณีฉุกเฉิน' },
      { id: 'lt-sick', code: 'sick', name: 'ลาป่วย' },
      { id: 'lt-unpaid', code: 'unpaid', name: 'ลาไม่รับค่าจ้าง' },
    ];
    const leaveBalances = overrides.leaveBalances ?? [];
    const prisma = {
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue(overrides.requests ?? []),
        findFirst: jest.fn().mockResolvedValue(null),
      },
      monthlyOffRequest: {
        findMany: jest.fn().mockResolvedValue(overrides.monthlyOff ?? []),
      },
      requestInstance: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      workflowAction: {
        findMany: jest.fn().mockResolvedValue(overrides.actions ?? []),
      },
      payrollCycle: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      leaveType: {
        findMany: jest.fn().mockResolvedValue(leaveTypes),
      },
      leaveBalance: {
        findFirst: jest.fn(async ({ where }: {
          where: { leaveTypeId: string; periodStart: Date };
        }) => {
          const periodStart = where.periodStart.toISOString().slice(0, 10);
          return leaveBalances.find((row) => (
            row.leaveTypeId === where.leaveTypeId
            && String(row.periodStart).slice(0, 10) === periodStart
          )) ?? null;
        }),
        create: jest.fn().mockResolvedValue({}),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const dates = {
      now: jest.fn().mockReturnValue(new Date('2026-06-24T10:00:00.000Z')),
    };
    const monthlyOff = {
      adminDeleteOffDate: jest.fn().mockResolvedValue({
        employeeId: 'emp-1',
        companyId: 'co-1',
        affectedDates: ['2026-07-06'],
      }),
      adminUpdateOffDate: jest.fn().mockResolvedValue({
        employeeId: 'emp-1',
        companyId: 'co-1',
        affectedDates: ['2026-07-06', '2026-07-07'],
      }),
    };
    const payrollBuilder = {
      buildCycle: jest.fn().mockResolvedValue({}),
    };

    const service = new EmployeeLeaveService(
      prisma as never,
      {
        assertEmployeeReadable: jest.fn(),
        assertEmployeeInCompany: jest.fn(),
      } as never,
      leaveService as never,
      leaveSettings as never,
      dates as never,
      monthlyOff as never,
      payrollBuilder as never,
    );

    return { service, leaveService, prisma, monthlyOff, payrollBuilder };
  }

  it('maps summary from year usage and current-year request counts', async () => {
    const { service } = buildService({
      leaveBalances: [
        {
          id: 'bal-emergency',
          leaveTypeId: 'lt-emergency',
          periodStart: '2026-01-01',
          entitled: 4,
          used: 1,
          remaining: 3,
        },
        {
          id: 'bal-sick',
          leaveTypeId: 'lt-sick',
          periodStart: '2026-01-01',
          entitled: 0,
          used: 2,
          remaining: -2,
        },
        {
          id: 'bal-unpaid',
          leaveTypeId: 'lt-unpaid',
          periodStart: '2026-01-01',
          entitled: 0,
          used: 1,
          remaining: -1,
        },
      ],
      requests: [
        {
          id: 'lr-1',
          createdAt: new Date('2026-06-01T10:00:00.000Z'),
          startDate: new Date('2026-06-10'),
          endDate: new Date('2026-06-11'),
          days: 2,
          status: 'approved',
          reason: 'Trip',
          workflowInstanceId: 'wf-1',
          leaveType: { code: 'sick', name: 'Sick leave' },
        },
        {
          id: 'lr-2',
          createdAt: new Date('2026-05-01T10:00:00.000Z'),
          startDate: new Date('2026-05-10'),
          endDate: new Date('2026-05-10'),
          days: 1,
          status: 'pending',
          reason: null,
          workflowInstanceId: null,
          leaveType: { code: 'sick', name: 'Sick leave' },
        },
      ],
      actions: [{
        workflowInstanceId: 'wf-1',
        action: 'approve',
        actor: {
          username: 'owner',
          employee: { firstName: 'Owner', lastName: 'User' },
        },
      }],
    });

    const result = await service.getLeave(actor, 'emp-1', 'co-1');
    expect(result.summary.emergencyLeaveRemaining).toBe(3);
    expect(result.summary.sickLeaveUsed).toBe(4); // prior 2 + system 2
    expect(result.summary.unpaidLeaveUsed).toBe(1);
    expect(result.summary.leaveRequestsThisYear).toBe(2);
    expect(result.summary.pendingRequests).toBe(1);
    expect(result.summary.approvedRequests).toBe(1);
    expect(result.summary.yearUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        leaveTypeCode: 'sick',
        priorUsed: 2,
        systemUsed: 2,
        totalUsed: 4,
      }),
      expect.objectContaining({
        leaveTypeCode: 'emergency',
        priorUsed: 1,
        remaining: 3,
      }),
    ]));
    expect(result.balances).toEqual(expect.arrayContaining([
      expect.objectContaining({ leaveTypeCode: 'sick', priorUsed: 2 }),
      expect.objectContaining({ leaveTypeCode: 'emergency', priorUsed: 1, entitled: 4 }),
    ]));
    expect(result.history).toHaveLength(2);
    expect(result.history[0].approverName).toBe('Owner User');
    expect(result.history[0].leaveTypeCode).toBe('sick');
  });

  it('includes approved monthly off in history', async () => {
    const { service } = buildService({
      monthlyOff: [{
        id: 'mo-1',
        createdAt: new Date('2026-07-04T03:57:00.000Z'),
        selectedDates: ['2026-07-06'],
        status: 'approved',
        workflowInstanceId: 'wf-mo',
      }],
    });

    const result = await service.getLeave(actor, 'emp-1', 'co-1');
    expect(result.history).toHaveLength(1);
    expect(result.history[0].leaveTypeCode).toBe('monthly_off');
    expect(result.history[0].leaveTypeName).toBe('วันหยุดประจำเดือน');
    expect(result.history[0].startDate).toBe('2026-07-06');
    expect(result.history[0].shortNotice).toBe(true);
    expect(result.summary.approvedRequests).toBe(1);
    expect(result.summary.yearUsage).toEqual(expect.arrayContaining([
      expect.objectContaining({
        leaveTypeCode: 'monthly_off',
        totalUsed: 1,
      }),
    ]));
  });

  it('saves prior usage opening balances', async () => {
    const { service, prisma } = buildService({});
    const stored: Array<Record<string, unknown>> = [];
    prisma.leaveBalance.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => {
      stored.push(data);
      return data;
    });
    prisma.leaveBalance.findFirst.mockImplementation(async ({ where }: {
      where: { leaveTypeId: string; periodStart: Date };
    }) => {
      const periodStart = where.periodStart.toISOString().slice(0, 10);
      return stored.find((row) => (
        row.leaveTypeId === where.leaveTypeId
        && String(row.periodStart).slice(0, 10) === periodStart
      )) ?? null;
    });

    const result = await service.setPriorUsage(actor, 'emp-1', 'co-1', {
      items: [
        { leaveTypeCode: 'emergency', priorUsed: 1, entitled: 4 },
        { leaveTypeCode: 'sick', priorUsed: 3 },
        { leaveTypeCode: 'unpaid', priorUsed: 0 },
      ],
    });

    expect(prisma.leaveBalance.create).toHaveBeenCalledTimes(3);
    expect(result.balances.find((row) => row.leaveTypeCode === 'sick')?.priorUsed).toBe(3);
    expect(result.summary.sickLeaveUsed).toBe(3);
    expect(result.summary.emergencyLeaveRemaining).toBe(3);
  });

  it('deletes monthly off and rebuilds open payroll cycles', async () => {
    const { service, monthlyOff, payrollBuilder, prisma } = buildService({
      monthlyOff: [],
    });
    prisma.payrollCycle.findMany.mockResolvedValue([{ id: 'cycle-1' }]);

    await service.deleteHistoryItem(actor, 'emp-1', 'co-1', 'mo-1', {
      source: 'monthly_off',
      offDate: '2026-07-06',
    });

    expect(monthlyOff.adminDeleteOffDate).toHaveBeenCalledWith(
      actor,
      'mo-1',
      '2026-07-06',
    );
    expect(payrollBuilder.buildCycle).toHaveBeenCalledWith(actor, 'cycle-1');
  });
});
