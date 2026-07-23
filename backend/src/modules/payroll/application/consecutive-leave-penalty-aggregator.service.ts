// ============================================================================
// Replays approved leave chronology to find consecutive-extension penalties.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import {
  computeConsecutiveLeavePenalties,
  ConsecutiveLeavePenaltySummary,
} from '../domain/services/consecutive-leave-penalty.service';
import { payrollAttendanceWindowOf } from '../../../shared/time/payroll-period.util';

const HOURS_PER_MONTH = 30 * 8;

@Injectable()
export class ConsecutiveLeavePenaltyAggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveSettings: LeaveSettingsService,
  ) {}

  async aggregateForPeriod(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ConsecutiveLeavePenaltySummary> {
    const rules = await this.leaveSettings.getRules(companyId);
    const hourlyRate = await this.resolveHourlyRate(employeeId, companyId);
    if (!rules.consecutiveLeavePenaltyEnabled || hourlyRate <= 0) {
      return { totalDeduction: 0, sources: [] };
    }

    const requests = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
        startDate: { lte: periodEnd },
        endDate: { gte: new Date('1970-01-01') },
      },
      include: { leaveType: { select: { code: true } } },
      orderBy: { createdAt: 'asc' },
    });

    const window = payrollAttendanceWindowOf(
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
    );

    return computeConsecutiveLeavePenalties(
      requests.map((row) => ({
        requestId: row.id,
        startDate: row.startDate,
        endDate: row.endDate,
        leaveTypeCode: row.leaveType.code,
        createdAt: row.createdAt,
      })),
      {
        enabled: rules.consecutiveLeavePenaltyEnabled,
        baseDays: rules.consecutiveLeaveBaseDays,
        laborUnits: rules.additionalConsecutiveLeavePenaltyLaborUnits,
        hourlyRate,
      },
      window.periodStart,
      window.periodEnd,
    );
  }

  private async resolveHourlyRate(employeeId: string, companyId: string): Promise<number> {
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
    return Math.round((Number(band.monthlySalary) / HOURS_PER_MONTH) * 100) / 100;
  }
}
