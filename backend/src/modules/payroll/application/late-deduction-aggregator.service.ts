// ============================================================================
// modules/payroll/application/late-deduction-aggregator.service.ts
// Reads stored attendance lateDeduction values — does not recalculate.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  payrollAttendanceWindowOf,
  toUtcDateOnly,
} from '../../../shared/time/payroll-period.util';
import {
  LateDeductionSummary,
  summarizeLateDeductions,
} from '../domain/services/late-deduction.service';

@Injectable()
export class LateDeductionAggregatorService {
  constructor(private readonly prisma: PrismaService) {}

  async aggregateForPeriod(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<LateDeductionSummary> {
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
        lateDeduction: { gt: 0 },
      },
      select: {
        id: true,
        workDate: true,
        lateDeduction: true,
      },
      orderBy: { workDate: 'asc' },
    });

    return summarizeLateDeductions(
      records.map((row) => ({
        id: row.id,
        workDate: row.workDate,
        amount: Number(row.lateDeduction),
      })),
    );
  }
}
