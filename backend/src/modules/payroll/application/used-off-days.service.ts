// ============================================================================
// modules/payroll/application/used-off-days.service.ts
// Counts off-day units for unused off-day OT bonus in a payroll period.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  countOffDayUnits,
  type LeaveDayRow,
  type MonthlyOffDateRow,
} from '../domain/services/off-day-ot-usage.service';

@Injectable()
export class UsedOffDaysService {
  constructor(private readonly prisma: PrismaService) {}

  async countUsedOffDays(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const periodStartIso = periodStart.toISOString().slice(0, 10);
    const periodEndIso = periodEnd.toISOString().slice(0, 10);

    const [monthlyOffRows, leaveRows] = await Promise.all([
      this.prisma.monthlyOffRequest.findMany({
        where: {
          employeeId,
          companyId,
          status: 'approved',
          deletedAt: null,
        },
        select: { selectedDates: true, status: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId,
          companyId,
          status: 'approved',
          deletedAt: null,
          startDate: { lte: periodEnd },
          endDate: { gte: periodStart },
        },
        include: { leaveType: { select: { code: true } } },
      }),
    ]);

    return countOffDayUnits({
      periodStartIso,
      periodEndIso,
      monthlyOffRows: monthlyOffRows as MonthlyOffDateRow[],
      leaveRows: leaveRows.map((row) => ({
        startDate: row.startDate,
        endDate: row.endDate,
        status: row.status,
        leaveTypeCode: row.leaveType.code,
      })) satisfies LeaveDayRow[],
      includePending: false,
    });
  }
}
