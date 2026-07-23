// ============================================================================
// modules/ai/application/employee-self-service-query.service.unit.spec.ts
// ============================================================================

import { EmployeeSelfServiceQueryService } from './employee-self-service-query.service';
import { LeaveRepository } from '../../leave/domain/repositories/leave.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';

describe('EmployeeSelfServiceQueryService', () => {
  const ctx = { employeeId: 'emp-1', companyId: 'co-1' };
  let leave: jest.Mocked<Pick<LeaveRepository, 'findTypeByCode' | 'getBalance'>>;
  let prisma: {
    employee: { findFirst: jest.Mock };
    employeeAssignment: { findFirst: jest.Mock };
    leaveRequest: { findMany: jest.Mock };
    attendanceRecord: { findMany: jest.Mock };
    overtimeRecord: { findMany: jest.Mock };
    payslip: { findFirst: jest.Mock; findMany: jest.Mock };
    payrollCycle: { findFirst: jest.Mock; findMany: jest.Mock };
    marketingCommissionMemberResult: { findFirst: jest.Mock; findMany: jest.Mock };
    adminCommissionMemberResult: { findFirst: jest.Mock; findMany: jest.Mock };
    commissionRecord: { findMany: jest.Mock };
    referral: { findMany: jest.Mock };
  };
  let service: EmployeeSelfServiceQueryService;

  beforeEach(() => {
    leave = {
      findTypeByCode: jest.fn().mockImplementation(async (code: string) => ({
        id: `type-${code}`,
        code,
        name: code,
        allowBorrowFuture: false,
      })),
      getBalance: jest.fn().mockImplementation(async (_employeeId, leaveTypeId) => {
        if (leaveTypeId === 'type-annual') {
          return { entitled: 10, used: 2, borrowed: 0, remaining: 8 };
        }
        if (leaveTypeId === 'type-emergency') {
          return { entitled: 3, used: 0, borrowed: 0, remaining: 3 };
        }
        if (leaveTypeId === 'type-unpaid') {
          return { entitled: 0, used: 1, borrowed: 0, remaining: 0 };
        }
        return null;
      }),
    };

    prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({
          globalId: 'EMP000001',
          hireDate: new Date('2025-01-01'),
          employmentStatus: 'active',
        }),
      },
      employeeAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          roleLevel: 'employee',
          company: { code: 'SB', name: 'SB Company' },
          team: { name: 'Sales A' },
        }),
      },
      leaveRequest: {
        findMany: jest.fn().mockResolvedValue([
          {
            leaveType: { code: 'annual', name: 'Annual Leave' },
            startDate: new Date('2026-06-01'),
            endDate: new Date('2026-06-02'),
            days: 2,
            status: 'approved',
          },
        ]),
      },
      attendanceRecord: {
        findMany: jest.fn().mockResolvedValue([
          { checkInAt: new Date(), checkOutAt: new Date(), lateMinutes: 15 },
          { checkInAt: new Date(), checkOutAt: null, lateMinutes: 0 },
        ]),
      },
      overtimeRecord: {
        findMany: jest.fn().mockResolvedValue([
          { status: 'pending', otHours: 2, payrollItemId: null },
          { status: 'approved', otHours: 3, payrollItemId: 'pay-1' },
        ]),
      },
      payslip: {
        findFirst: jest.fn().mockResolvedValue({
          gross: 50000,
          deductions: 5000,
          net: 45000,
          payrollCycle: {
            periodStart: new Date('2026-05-25'),
            periodEnd: new Date('2026-06-24'),
          },
        }),
        findMany: jest.fn().mockResolvedValue([
          { gross: 50000, deductions: 5000, net: 45000 },
          { gross: 48000, deductions: 4800, net: 43200 },
        ]),
      },
      payrollCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'cycle-1',
          periodStart: new Date('2026-05-25'),
          periodEnd: new Date('2026-06-24'),
        }),
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'cycle-1',
            periodStart: new Date('2026-05-25'),
            periodEnd: new Date('2026-06-24'),
          },
        ]),
      },
      marketingCommissionMemberResult: {
        findFirst: jest.fn().mockResolvedValue({ finalPayout: 1200, status: 'pending_pay' }),
        findMany: jest.fn().mockResolvedValue([
          {
            finalPayout: 1200,
            cycle: { earnCycleId: 'cycle-1' },
          },
        ]),
      },
      adminCommissionMemberResult: {
        findFirst: jest.fn().mockResolvedValue({ finalPayout: 800, status: 'pending_pay' }),
        findMany: jest.fn().mockResolvedValue([
          {
            finalPayout: 800,
            cycle: { earnCycleId: 'cycle-1' },
          },
        ]),
      },
      commissionRecord: {
        findMany: jest.fn().mockResolvedValue([
          { grossAmount: 500, status: 'accrued', qualified: true },
        ]),
      },
      referral: {
        findMany: jest.fn().mockImplementation(async ({ where }: { where: { status?: string } }) => {
          if (where.status === 'pending') return [{ rewardAmount: 2000 }];
          return [];
        }),
      },
    };

    service = new EmployeeSelfServiceQueryService(
      prisma as unknown as PrismaService,
      leave as unknown as LeaveRepository,
    );
  });

  it('returns leave balance fields for the authenticated employee', async () => {
    const result = await service.getMyLeaveBalance(ctx);
    expect(result).toMatchObject({
      annualLeaveRemaining: 8,
      emergencyLeaveRemaining: 3,
      unpaidLeaveUsed: 1,
      currentYear: new Date().getUTCFullYear(),
    });
    expect(leave.getBalance).toHaveBeenCalledWith('emp-1', 'type-annual', expect.any(Date));
  });

  it('returns leave history scoped to employee and company', async () => {
    const result = await service.getMyLeaveHistory(ctx) as { requests: unknown[] };
    expect(result.requests).toHaveLength(1);
    expect(prisma.leaveRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ employeeId: 'emp-1', companyId: 'co-1' }),
      take: 20,
    }));
  });

  it('returns attendance metrics for current month', async () => {
    const result = await service.getMyAttendanceSummary(ctx) as {
      presentDays: number;
      checkIns: number;
      checkOuts: number;
    };
    expect(result.presentDays).toBe(2);
    expect(result.checkIns).toBe(2);
    expect(result.checkOuts).toBe(1);
  });

  it('returns late statistics for current month', async () => {
    const result = await service.getMyLateStatistics(ctx) as {
      lateCount: number;
      totalLateMinutes: number;
    };
    expect(result.lateCount).toBe(1);
    expect(result.totalLateMinutes).toBe(15);
  });

  it('returns payroll summary without salary configuration fields', async () => {
    const result = await service.getMyPayrollSummary(ctx) as {
      totalIncome: number;
      averageMonthlyPay: number;
    };
    expect(result.totalIncome).toBe(98000);
    expect(result.averageMonthlyPay).toBe(44100);
  });

  it('returns commission summary split by type', async () => {
    const result = await service.getMyCommission(ctx) as {
      marketingCommission: number;
      adminCommission: number;
      recruitmentCommission: number;
    };
    expect(result.marketingCommission).toBe(1200);
    expect(result.adminCommission).toBe(800);
    expect(result.recruitmentCommission).toBe(500);
  });

  it('returns referral summary totals', async () => {
    const result = await service.getMyReferrals(ctx) as {
      pendingCount: number;
      totalRewardAmount: number;
    };
    expect(result.pendingCount).toBe(1);
    expect(result.totalRewardAmount).toBe(2000);
  });

  it('returns profile without sensitive fields', async () => {
    const result = await service.getMyProfile(ctx) as Record<string, unknown>;
    expect(result.employeeCode).toBe('EMP000001');
    expect(result).not.toHaveProperty('salary');
    expect(result).not.toHaveProperty('bankAccount');
    expect(result).not.toHaveProperty('email');
  });

  it('returns error when employee profile is missing', async () => {
    const result = await service.getMyLeaveBalance({ employeeId: null, companyId: 'co-1' });
    expect(result).toEqual({ error: 'No employee profile linked to this user' });
  });
});
