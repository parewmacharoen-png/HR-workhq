// ============================================================================
// modules/payroll/application/meal-eligible-days.service.ts
// Meal allowance: office check-in days only (hybrid-friendly).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { isMealIneligibleLeaveType } from '../../leave/domain/services/leave-type-classification';
import {
  payrollAttendanceWindowOf,
  toUtcDateOnly,
} from '../../../shared/time/payroll-period.util';
import { UsedOffDaysService } from './used-off-days.service';

export interface MealEligibleDaysResult {
  workingDays: number;
  officeDays: number;
  wfhDays: number;
  offDayLeaveDays: number;
  eligibleDays: number;
  /** Profile default — not used to zero out hybrid months. */
  workCategory: 'office' | 'wfh';
}

@Injectable()
export class MealEligibleDaysService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly usedOffDays: UsedOffDaysService,
  ) {}

  async countEligibleDays(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<MealEligibleDaysResult> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { workCategory: true },
    });
    const profileCategory = (employee?.workCategory ?? 'office') as 'office' | 'wfh';

    const window = payrollAttendanceWindowOf(
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
    );
    const windowStart = toUtcDateOnly(window.periodStart);
    const windowEnd = toUtcDateOnly(window.periodEnd);

    const [attendanceRows, leaveRequests] = await Promise.all([
      this.prisma.attendanceRecord.findMany({
        where: {
          employeeId,
          companyId,
          workDate: { gte: windowStart, lte: windowEnd },
          checkInAt: { not: null },
          deletedAt: null,
        },
        select: { workDate: true, workCategory: true },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId,
          companyId,
          status: 'approved',
          deletedAt: null,
          startDate: { lte: windowEnd },
          endDate: { gte: windowStart },
        },
        include: { leaveType: { select: { code: true } } },
      }),
    ]);

    const ineligibleDates = new Set<string>();
    for (const req of leaveRequests) {
      if (!isMealIneligibleLeaveType(req.leaveType.code)) continue;
      for (const day of eachDateInRange(req.startDate, req.endDate, windowStart, windowEnd)) {
        ineligibleDates.add(day);
      }
    }

    let officeDays = 0;
    let wfhDays = 0;
    for (const row of attendanceRows) {
      const key = row.workDate.toISOString().slice(0, 10);
      if (ineligibleDates.has(key)) continue;
      const dayCategory = row.workCategory === 'wfh'
        ? 'wfh'
        : row.workCategory === 'office'
          ? 'office'
          : profileCategory;
      if (dayCategory === 'office') officeDays++;
      else wfhDays++;
    }

    const workingDays = officeDays + wfhDays;

    // Off-day leave meal only when the employee actually worked office days this period.
    let cappedOffDays = 0;
    if (officeDays > 0) {
      const offDayLeaveDays = await this.usedOffDays.countUsedOffDays(
        employeeId,
        companyId,
        periodStart,
        periodEnd,
      );
      cappedOffDays = Math.min(4, offDayLeaveDays);
    }

    return {
      workingDays,
      officeDays,
      wfhDays,
      offDayLeaveDays: cappedOffDays,
      eligibleDays: officeDays + cappedOffDays,
      workCategory: profileCategory,
    };
  }
}

function eachDateInRange(
  start: Date,
  end: Date,
  periodStart: Date,
  periodEnd: Date,
): string[] {
  const from = start > periodStart ? start : periodStart;
  const to = end < periodEnd ? end : periodEnd;
  const dates: string[] = [];
  const cursor = new Date(from);
  while (cursor.getTime() <= to.getTime()) {
    dates.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return dates;
}
