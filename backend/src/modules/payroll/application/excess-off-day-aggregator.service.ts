// ============================================================================
// Aggregates approved excess monthly off-days for payroll deduction.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import { computeMonthlyOffEntitlement } from '../../leave/domain/services/monthly-off-entitlement.service';
import {
  computeExcessOffDayDeductions,
  ExcessOffDayDeductionSummary,
  ExcessOffDayRow,
  toExcessOffDayDeductionParams,
} from '../domain/services/excess-off-day-deduction.service';
import { payrollAttendanceWindowOf } from '../../../shared/time/payroll-period.util';

const DAYS_PER_MONTH = 30;

@Injectable()
export class ExcessOffDayAggregatorService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly leaveSettings: LeaveSettingsService,
  ) {}

  async aggregateForPeriod(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ExcessOffDayDeductionSummary> {
    const rules = await this.leaveSettings.getRules(companyId);
    const dailyWage = await this.resolveDailyWage(employeeId, companyId);
    if (dailyWage <= 0) {
      return { totalDeduction: 0, sources: [] };
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { hireDate: true, terminationDate: true },
    });
    const periodStartIso = periodStart.toISOString().slice(0, 10);
    const periodEndIso = periodEnd.toISOString().slice(0, 10);
    const entitlement = employee
      ? computeMonthlyOffEntitlement({
        monthlyOffDays: rules.monthlyOffDays,
        periodStartIso,
        periodEndIso,
        hireDate: employee.hireDate,
        terminationDate: employee.terminationDate,
      })
      : { entitledOffDays: rules.monthlyOffDays };

    const rows = await this.loadApprovedOffRows(
      employeeId,
      companyId,
      periodStart,
      periodEnd,
    );

    return computeExcessOffDayDeductions(
      rows,
      toExcessOffDayDeductionParams(rules, dailyWage, entitlement.entitledOffDays),
    );
  }

  private async loadApprovedOffRows(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<ExcessOffDayRow[]> {
    const window = payrollAttendanceWindowOf(
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
    );
    const startIso = window.periodStart;
    const endIso = window.periodEnd;

    const requests = await this.prisma.monthlyOffRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
      },
      select: {
        id: true,
        selectedDates: true,
        createdAt: true,
      },
    });

    const rows: ExcessOffDayRow[] = [];
    for (const req of requests) {
      const dates = Array.isArray(req.selectedDates) ? req.selectedDates as string[] : [];
      for (const offDate of dates) {
        if (offDate >= startIso && offDate <= endIso) {
          rows.push({
            monthlyOffRequestId: req.id,
            offDate,
            submittedAt: req.createdAt,
          });
        }
      }
    }
    return rows;
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
    return Math.round((Number(band.monthlySalary) / DAYS_PER_MONTH) * 100) / 100;
  }
}
