// ============================================================================
// Reads stored attendance breakDeduction values for payroll.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  payrollAttendanceWindowOf,
  toUtcDateOnly,
} from '../../../shared/time/payroll-period.util';
import {
  BreakDeductionSummary,
  summarizeBreakDeductions,
} from '../domain/services/break-deduction.service';
import type { BreakPenaltyTier } from '../../../shared/attendance/break-deduction.util';

@Injectable()
export class BreakDeductionAggregatorService {
  constructor(private readonly prisma: PrismaService) {}

  async aggregateForPeriod(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<BreakDeductionSummary> {
    const window = payrollAttendanceWindowOf(
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
    );
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        companyId,
        workDate: {
          gte: toUtcDateOnly(window.periodStart),
          lte: toUtcDateOnly(window.periodEnd),
        },
        deletedAt: null,
        breakDeduction: { gt: 0 },
      },
      select: {
        id: true,
        workDate: true,
        breakDeduction: true,
        totalBreakMinutes: true,
        breakPenaltyTier: true,
      },
      orderBy: { workDate: 'asc' },
    });

    return summarizeBreakDeductions(
      records.map((row) => ({
        id: row.id,
        workDate: row.workDate,
        amount: Number(row.breakDeduction),
        tier: (row.breakPenaltyTier ?? 'hourly') as BreakPenaltyTier,
        totalBreakMinutes: row.totalBreakMinutes ?? 0,
      })),
    );
  }
}
