// ============================================================================
// modules/attendance/application/employee-day-context.service.ts
// Loads leave / approved monthly-off context for an employee on a work date.
// Monthly off = employee-chosen off days (4/month, approved) — NOT weekends.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LEAVE_REPOSITORY, LeaveRepository } from '../../leave/domain/repositories/leave.repository';
import { Inject } from '@nestjs/common';
import {
  datesIncludeSelectedDate,
  EmployeeDayContext,
  formatBangkokDateIso,
  resolveEmployeeDayContext,
} from '../domain/services/employee-day-context';

@Injectable()
export class EmployeeDayContextService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LEAVE_REPOSITORY) private readonly leave: LeaveRepository,
  ) {}

  async getContext(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<EmployeeDayContext> {
    const dateIso = formatBangkokDateIso(workDate);
    const [hasApprovedLeave, monthlyOffRows] = await Promise.all([
      this.leave.hasApprovedLeaveForEmployeeOnDate(employeeId, companyId, workDate),
      this.prisma.monthlyOffRequest.findMany({
        where: {
          employeeId,
          companyId,
          status: 'approved',
          deletedAt: null,
        },
        select: { selectedDates: true },
      }),
    ]);

    const hasApprovedMonthlyOff = monthlyOffRows.some(
      (row) => datesIncludeSelectedDate(row.selectedDates, dateIso),
    );

    return resolveEmployeeDayContext({
      hasApprovedLeave,
      hasApprovedMonthlyOff,
      // Weekends are normal workdays unless employee has approved monthly off.
      isHoliday: false,
    });
  }
}
