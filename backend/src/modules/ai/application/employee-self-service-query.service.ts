// ============================================================================
// modules/ai/application/employee-self-service-query.service.ts
// Read-only employee self-service queries for AI tools.
// Always scoped to the authenticated employee + company from tool context.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import {
  LEAVE_REPOSITORY,
  LeaveRepository,
} from '../../leave/domain/repositories/leave.repository';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AiToolExecutionContext } from '../domain/tool.types';

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function requireEmployee(ctx: AiToolExecutionContext): string | { error: string } {
  if (!ctx.employeeId) return { error: 'No employee profile linked to this user' };
  return ctx.employeeId;
}

@Injectable()
export class EmployeeSelfServiceQueryService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEAVE_REPOSITORY) private readonly leave: LeaveRepository,
  ) {}

  private periodStartOf(date: Date): Date {
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 25));
    if (date.getUTCDate() < 25) start.setUTCMonth(start.getUTCMonth() - 1);
    return start;
  }

  private currentMonthRange(now = new Date()): { start: Date; end: Date; label: string } {
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0));
    return {
      start,
      end,
      label: `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`,
    };
  }

  private countWeekdaysInclusive(start: Date, end: Date): number {
    let count = 0;
    const cursor = new Date(start);
    while (cursor <= end) {
      const day = cursor.getUTCDay();
      if (day !== 0 && day !== 6) count += 1;
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return count;
  }

  private async leaveRemainingByCode(
    employeeId: string,
    code: string,
    periodStart: Date,
  ): Promise<number> {
    const type = await this.leave.findTypeByCode(code);
    if (!type) return 0;
    const balance = await this.leave.getBalance(employeeId, type.id, periodStart);
    return balance?.remaining ?? 0;
  }

  private async leaveUsedByCode(
    employeeId: string,
    code: string,
    periodStart: Date,
  ): Promise<number> {
    const type = await this.leave.findTypeByCode(code);
    if (!type) return 0;
    const balance = await this.leave.getBalance(employeeId, type.id, periodStart);
    return balance?.used ?? 0;
  }

  async getMyProfile(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        globalId: true,
        hireDate: true,
        employmentStatus: true,
      },
    });
    if (!employee) return { error: 'Employee record not found' };

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        companyId: ctx.companyId,
        effectiveTo: null,
        deletedAt: null,
      },
      include: {
        company: { select: { code: true, name: true } },
        team: { select: { name: true } },
      },
    });

    return {
      employeeCode: employee.globalId,
      company: assignment?.company ?? null,
      team: assignment?.team?.name ?? null,
      position: assignment?.roleLevel ?? null,
      startDate: employee.hireDate.toISOString().slice(0, 10),
      employmentStatus: employee.employmentStatus,
    };
  }

  async getMyLeaveBalance(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const now = new Date();
    const periodStart = this.periodStartOf(now);

    const [annualLeaveRemaining, emergencyLeaveRemaining, unpaidLeaveUsed] = await Promise.all([
      this.leaveRemainingByCode(employeeId, 'annual', periodStart),
      this.leaveRemainingByCode(employeeId, 'emergency', periodStart),
      this.leaveUsedByCode(employeeId, 'unpaid', periodStart),
    ]);

    return {
      annualLeaveRemaining: roundMoney(annualLeaveRemaining),
      emergencyLeaveRemaining: roundMoney(emergencyLeaveRemaining),
      unpaidLeaveUsed: roundMoney(unpaidLeaveUsed),
      currentYear: now.getUTCFullYear(),
      periodStart: periodStart.toISOString().slice(0, 10),
    };
  }

  async getMyLeaveHistory(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId: ctx.companyId,
        deletedAt: null,
      },
      include: { leaveType: { select: { code: true, name: true } } },
      orderBy: { startDate: 'desc' },
      take: 20,
    });

    return {
      requests: requests.map((r) => ({
        leaveType: r.leaveType.name,
        leaveTypeCode: r.leaveType.code,
        startDate: r.startDate.toISOString().slice(0, 10),
        endDate: r.endDate.toISOString().slice(0, 10),
        days: Number(r.days),
        status: r.status,
      })),
    };
  }

  async getMyAttendanceSummary(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const now = new Date();
    const { start: monthStart, end: monthEnd, label } = this.currentMonthRange(now);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const rangeEnd = today < monthEnd ? today : monthEnd;

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        companyId: ctx.companyId,
        workDate: { gte: monthStart, lte: rangeEnd },
        deletedAt: null,
      },
    });

    const presentDays = records.filter((r) => r.checkInAt).length;
    const workingDays = this.countWeekdaysInclusive(monthStart, rangeEnd);
    const checkIns = records.filter((r) => r.checkInAt).length;
    const checkOuts = records.filter((r) => r.checkOutAt).length;

    return {
      month: label,
      workingDays,
      presentDays,
      absentDays: Math.max(0, workingDays - presentDays),
      checkIns,
      checkOuts,
    };
  }

  async getMyLateStatistics(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const now = new Date();
    const { start: monthStart, label } = this.currentMonthRange(now);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        companyId: ctx.companyId,
        workDate: { gte: monthStart, lte: today },
        deletedAt: null,
      },
    });

    const lateRecords = records.filter((r) => r.lateMinutes > 0);
    const totalLateMinutes = lateRecords.reduce((sum, r) => sum + r.lateMinutes, 0);
    const lateCount = lateRecords.length;

    return {
      month: label,
      lateCount,
      totalLateMinutes,
      averageLateMinutes: lateCount > 0 ? roundMoney(totalLateMinutes / lateCount) : 0,
    };
  }

  async getMyOtSummary(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const now = new Date();
    const { start: monthStart, label } = this.currentMonthRange(now);
    const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

    const records = await this.prisma.overtimeRecord.findMany({
      where: {
        employeeId,
        companyId: ctx.companyId,
        workDate: { gte: monthStart, lte: today },
        deletedAt: null,
      },
    });

    const pending = records.filter((r) => r.status === 'pending');
    const approved = records.filter((r) => r.status === 'approved');
    const paid = records.filter((r) => r.payrollItemId !== null);

    const sumHours = (rows: typeof records) =>
      roundMoney(rows.reduce((sum, r) => sum + Number(r.otHours), 0));

    return {
      month: label,
      pendingOtCount: pending.length,
      approvedOtCount: approved.length,
      paidOtCount: paid.length,
      pendingHours: sumHours(pending),
      approvedHours: sumHours(approved),
      paidHours: sumHours(paid),
      totalHours: sumHours(records),
    };
  }

  async getMyLatestPayslip(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const payslip = await this.prisma.payslip.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        payrollCycle: { companyId: ctx.companyId, deletedAt: null },
      },
      orderBy: { generatedAt: 'desc' },
      include: { payrollCycle: true },
    });

    if (!payslip) return { message: 'No payslip found' };

    return {
      period: {
        start: payslip.payrollCycle.periodStart.toISOString().slice(0, 10),
        end: payslip.payrollCycle.periodEnd.toISOString().slice(0, 10),
      },
      gross: Number(payslip.gross),
      deductions: Number(payslip.deductions),
      net: Number(payslip.net),
    };
  }

  async getMyPayrollSummary(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 12);

    const payslips = await this.prisma.payslip.findMany({
      where: {
        employeeId,
        deletedAt: null,
        generatedAt: { gte: since },
        payrollCycle: { companyId: ctx.companyId, deletedAt: null },
      },
      include: { payrollCycle: true },
      orderBy: { generatedAt: 'desc' },
    });

    const totalIncome = payslips.reduce((sum, p) => sum + Number(p.gross), 0);
    const totalDeductions = payslips.reduce((sum, p) => sum + Number(p.deductions), 0);
    const totalNet = payslips.reduce((sum, p) => sum + Number(p.net), 0);
    const monthCount = payslips.length;

    return {
      monthsIncluded: monthCount,
      totalIncome: roundMoney(totalIncome),
      totalDeductions: roundMoney(totalDeductions),
      totalNet: roundMoney(totalNet),
      averageMonthlyPay: monthCount > 0 ? roundMoney(totalNet / monthCount) : 0,
    };
  }

  async getMyCommission(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { companyId: ctx.companyId, status: { in: ['open', 'locked'] }, deletedAt: null },
      orderBy: { periodStart: 'desc' },
    });

    const earnCycleId = cycle?.id;

    const [marketing, admin, recruitment, holdRecords] = await Promise.all([
      earnCycleId
        ? this.prisma.marketingCommissionMemberResult.findFirst({
          where: {
            employeeId,
            cycle: { companyId: ctx.companyId, earnCycleId, deletedAt: null },
          },
          select: { finalPayout: true, status: true },
        })
        : Promise.resolve(null),
      earnCycleId
        ? this.prisma.adminCommissionMemberResult.findFirst({
          where: {
            employeeId,
            cycle: { companyId: ctx.companyId, earnCycleId, deletedAt: null },
          },
          select: { finalPayout: true, status: true },
        })
        : Promise.resolve(null),
      earnCycleId
        ? this.prisma.commissionRecord.findMany({
          where: {
            employeeId,
            companyId: ctx.companyId,
            earnCycleId,
            deletedAt: null,
          },
          select: { grossAmount: true, status: true, qualified: true },
        })
        : Promise.resolve([]),
      this.prisma.commissionRecord.findMany({
        where: {
          employeeId,
          companyId: ctx.companyId,
          status: 'hold',
          deletedAt: null,
          ...(earnCycleId ? { earnCycleId } : {}),
        },
        select: { grossAmount: true },
      }),
    ]);

    const recruitmentTotal = recruitment.reduce((sum, r) => sum + Number(r.grossAmount), 0);
    const holdTotal = holdRecords.reduce((sum, r) => sum + Number(r.grossAmount), 0);

    const marketingAmount = marketing ? Number(marketing.finalPayout) : 0;
    const adminAmount = admin ? Number(admin.finalPayout) : 0;

    const pendingStatuses = new Set(['accrued', 'pending_pay', 'carried_forward', 'no_payout']);
    const payableStatuses = new Set(['pending_pay', 'qualified']);

    const marketingStatus = marketing?.status ?? null;
    const adminStatus = admin?.status ?? null;

    const pending = roundMoney(
      (pendingStatuses.has(marketingStatus ?? '') ? marketingAmount : 0)
      + (pendingStatuses.has(adminStatus ?? '') ? adminAmount : 0)
      + recruitment
        .filter((r) => !r.qualified && r.status === 'accrued')
        .reduce((sum, r) => sum + Number(r.grossAmount), 0),
    );

    const payable = roundMoney(
      (payableStatuses.has(marketingStatus ?? '') ? marketingAmount : 0)
      + (payableStatuses.has(adminStatus ?? '') ? adminAmount : 0)
      + recruitment
        .filter((r) => r.qualified && r.status !== 'paid')
        .reduce((sum, r) => sum + Number(r.grossAmount), 0),
    );

    return {
      cycleLabel: cycle
        ? `${cycle.periodStart.toISOString().slice(0, 10)} → ${cycle.periodEnd.toISOString().slice(0, 10)}`
        : null,
      marketingCommission: roundMoney(marketingAmount),
      adminCommission: roundMoney(adminAmount),
      recruitmentCommission: roundMoney(recruitmentTotal),
      marketingStatus,
      adminStatus,
      pending: roundMoney(pending),
      hold: roundMoney(holdTotal),
      payable: roundMoney(payable),
    };
  }

  async getMyCommissionHistory(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const since = new Date();
    since.setUTCMonth(since.getUTCMonth() - 12);

    const cycles = await this.prisma.payrollCycle.findMany({
      where: {
        companyId: ctx.companyId,
        periodStart: { gte: since },
        deletedAt: null,
      },
      orderBy: { periodStart: 'desc' },
      select: { id: true, periodStart: true, periodEnd: true },
    });

    const cycleIds = cycles.map((c) => c.id);
    if (cycleIds.length === 0) return { months: [] };

    const [marketingResults, adminResults, recruitmentRecords] = await Promise.all([
      this.prisma.marketingCommissionMemberResult.findMany({
        where: {
          employeeId,
          cycle: { earnCycleId: { in: cycleIds }, companyId: ctx.companyId },
        },
        include: { cycle: { select: { earnCycleId: true } } },
      }),
      this.prisma.adminCommissionMemberResult.findMany({
        where: {
          employeeId,
          cycle: { earnCycleId: { in: cycleIds }, companyId: ctx.companyId },
        },
        include: { cycle: { select: { earnCycleId: true } } },
      }),
      this.prisma.commissionRecord.findMany({
        where: {
          employeeId,
          companyId: ctx.companyId,
          earnCycleId: { in: cycleIds },
          deletedAt: null,
        },
      }),
    ]);

    const historyByCycle = new Map<string, {
      periodStart: string;
      periodEnd: string;
      marketing: number;
      admin: number;
      recruitment: number;
      total: number;
    }>();

    for (const cycle of cycles) {
      historyByCycle.set(cycle.id, {
        periodStart: cycle.periodStart.toISOString().slice(0, 10),
        periodEnd: cycle.periodEnd.toISOString().slice(0, 10),
        marketing: 0,
        admin: 0,
        recruitment: 0,
        total: 0,
      });
    }

    for (const row of marketingResults) {
      const bucket = historyByCycle.get(row.cycle.earnCycleId);
      if (!bucket) continue;
      bucket.marketing = roundMoney(bucket.marketing + Number(row.finalPayout));
    }

    for (const row of adminResults) {
      const bucket = historyByCycle.get(row.cycle.earnCycleId);
      if (!bucket) continue;
      bucket.admin = roundMoney(bucket.admin + Number(row.finalPayout));
    }

    for (const row of recruitmentRecords) {
      const bucket = historyByCycle.get(row.earnCycleId);
      if (!bucket) continue;
      bucket.recruitment = roundMoney(bucket.recruitment + Number(row.grossAmount));
    }

    const months = [...historyByCycle.values()]
      .map((entry) => ({
        ...entry,
        total: roundMoney(entry.marketing + entry.admin + entry.recruitment),
      }))
      .filter((entry) => entry.total > 0)
      .sort((a, b) => b.periodStart.localeCompare(a.periodStart));

    return { months };
  }

  async getMyReferrals(ctx: AiToolExecutionContext) {
    const employeeId = requireEmployee(ctx);
    if (typeof employeeId !== 'string') return employeeId;

    const base = {
      referrerEmployeeId: employeeId,
      companyId: ctx.companyId,
      deletedAt: null,
    };

    const [pending, qualified, paid] = await Promise.all([
      this.prisma.referral.findMany({ where: { ...base, status: 'pending' }, select: { rewardAmount: true } }),
      this.prisma.referral.findMany({ where: { ...base, status: 'qualified' }, select: { rewardAmount: true } }),
      this.prisma.referral.findMany({ where: { ...base, status: 'paid' }, select: { rewardAmount: true } }),
    ]);

    const sum = (rows: { rewardAmount: unknown }[]) =>
      roundMoney(rows.reduce((a, r) => a + Number(r.rewardAmount), 0));

    return {
      pendingCount: pending.length,
      qualifiedCount: qualified.length,
      paidCount: paid.length,
      pendingReward: sum(pending),
      qualifiedReward: sum(qualified),
      paidReward: sum(paid),
      totalRewardAmount: sum([...pending, ...qualified, ...paid]),
    };
  }
}
