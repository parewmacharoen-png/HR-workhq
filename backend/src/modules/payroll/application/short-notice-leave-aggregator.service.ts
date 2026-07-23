// ============================================================================
// Aggregates approved leave requests submitted with short notice for payroll.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import {
  payrollAttendanceWindowOf,
  toUtcDateOnly,
} from '../../../shared/time/payroll-period.util';
import {
  computeShortNoticeLeaveDeductions,
  formatShortNoticeLeaveDeductionNote,
  ShortNoticeLeaveDeductionSummary,
  toShortNoticeLeaveParams,
} from '../domain/services/short-notice-leave-deduction.service';

@Injectable()
export class ShortNoticeLeaveAggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveSettings: LeaveSettingsService,
  ) {}

  async aggregateForPeriod(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ShortNoticeLeaveDeductionSummary> {
    const rules = await this.leaveSettings.getRules(companyId);
    const dailyWage = await this.resolveDailyWage(employeeId, companyId);
    const window = payrollAttendanceWindowOf(
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
    );
    const windowStart = toUtcDateOnly(window.periodStart);
    const windowEnd = toUtcDateOnly(window.periodEnd);
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
        startDate: { lte: windowEnd },
        endDate: { gte: windowStart },
      },
      include: { leaveType: { select: { code: true } } },
    });

    return computeShortNoticeLeaveDeductions(
      rows.map((row) => ({
        leaveRequestId: row.id,
        leaveTypeCode: row.leaveType.code,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        days: Number(row.days),
        submittedAt: row.createdAt,
      })),
      toShortNoticeLeaveParams(rules, dailyWage),
      window.periodStart,
      window.periodEnd,
    );
  }

  formatNote(summary: ShortNoticeLeaveDeductionSummary): string {
    return formatShortNoticeLeaveDeductionNote(summary);
  }

  private async resolveDailyWage(employeeId: string, companyId: string): Promise<number> {
    const band = await this.prisma.salaryHistory.findFirst({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      select: { monthlySalary: true },
    });
    if (!band) return 0;
    return Math.round((Number(band.monthlySalary) / 30) * 100) / 100;
  }
}
