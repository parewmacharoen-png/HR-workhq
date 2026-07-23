import {
  EmployeeDayConflictService,
  expandIsoDateRange,
  formatEmployeeDayConflictMessage,
} from './employee-day-conflict.service';
import { EmployeeDayAlreadyBookedError } from '../domain/errors/leave.errors';

describe('employee-day-conflict helpers', () => {
  it('expands inclusive date ranges', () => {
    expect(expandIsoDateRange('2026-07-16', '2026-07-18')).toEqual([
      '2026-07-16',
      '2026-07-17',
      '2026-07-18',
    ]);
  });

  it('formats Thai conflict message', () => {
    expect(formatEmployeeDayConflictMessage([
      { date: '2026-07-16', kind: 'monthly_off', status: 'pending' },
    ])).toBe(
      'วันที่ 2026-07-16 มีคำขอวันหยุดประจำเดือน (รออนุมัติ) อยู่แล้ว — ไม่สามารถขอซ้ำได้',
    );
  });
});

describe('EmployeeDayConflictService', () => {
  it('blocks duplicate pending monthly off on the same day', async () => {
    const prisma = {
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      monthlyOffRequest: {
        findMany: jest.fn().mockResolvedValue([
          { selectedDates: ['2026-07-16'], status: 'pending' },
        ]),
      },
    };
    const service = new EmployeeDayConflictService(prisma as never);

    await expect(service.assertNoConflict({
      employeeId: 'emp-1',
      companyId: 'co-1',
      dates: ['2026-07-16'],
    })).rejects.toBeInstanceOf(EmployeeDayAlreadyBookedError);

    await expect(service.assertNoConflict({
      employeeId: 'emp-1',
      companyId: 'co-1',
      dates: ['2026-07-16'],
    })).rejects.toThrow(/2026-07-16/);
  });

  it('allows dates when no pending or approved booking exists', async () => {
    const prisma = {
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      monthlyOffRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new EmployeeDayConflictService(prisma as never);

    await expect(service.assertNoConflict({
      employeeId: 'emp-1',
      companyId: 'co-1',
      dates: ['2026-07-16'],
    })).resolves.toBeUndefined();
  });

  it('ignores excluded monthly off request when editing', async () => {
    const prisma = {
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      monthlyOffRequest: {
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    const service = new EmployeeDayConflictService(prisma as never);

    await service.assertNoConflict({
      employeeId: 'emp-1',
      companyId: 'co-1',
      dates: ['2026-07-16'],
      excludeMonthlyOffRequestId: 'mo-1',
    });

    expect(prisma.monthlyOffRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { not: 'mo-1' },
        }),
      }),
    );
  });
});
