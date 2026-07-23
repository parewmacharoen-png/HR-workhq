// ============================================================================
// modules/payroll/application/absence-deduction-aggregator.service.ts
// Aggregates approved absence penalties for payroll — ignores flagged/waived/disputed.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { normalizePosition } from '../../attendance/domain/services/absence-penalty.service';
import {
  payrollAttendanceWindowOf,
  toUtcDateOnly,
} from '../../../shared/time/payroll-period.util';
import {
  AbsenceDeductionSummary,
  summarizeAbsenceDeductions,
} from '../domain/services/absence-deduction.service';

@Injectable()
export class AbsenceDeductionAggregatorService {
  constructor(private readonly prisma: PrismaService) {}

  async aggregateForPeriod(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
    cycleId?: string,
  ): Promise<AbsenceDeductionSummary> {
    const existingItem = cycleId
      ? await this.prisma.payrollItem.findFirst({
        where: {
          payrollCycleId: cycleId,
          employeeId,
          itemType: 'absence_deduction',
          deletedAt: null,
        },
        select: { id: true },
      })
      : null;

    const window = payrollAttendanceWindowOf(
      periodStart.toISOString().slice(0, 10),
      periodEnd.toISOString().slice(0, 10),
    );
    const records = await this.prisma.absenceRecord.findMany({
      where: {
        employeeId,
        companyId,
        workDate: {
          gte: toUtcDateOnly(window.periodStart),
          lte: toUtcDateOnly(window.periodEnd),
        },
        status: 'approved',
        deletedAt: null,
        penaltyAmount: { gt: 0 },
        OR: [
          { payrollItemId: null },
          ...(existingItem ? [{ payrollItemId: existingItem.id }] : []),
        ],
      },
      select: {
        id: true,
        workDate: true,
        penaltyAmount: true,
        roleLevelSnapshot: true,
        positionSnapshot: true,
      },
      orderBy: { workDate: 'asc' },
    });

    const eligible = records.filter(
      (row) => normalizePosition(row.positionSnapshot) !== 'owner',
    );

    return summarizeAbsenceDeductions(
      eligible.map((row) => ({
        id: row.id,
        workDate: row.workDate,
        amount: Number(row.penaltyAmount),
        roleLevel: row.roleLevelSnapshot,
      })),
    );
  }

  async linkRecordsToPayrollItem(recordIds: string[], payrollItemId: string): Promise<void> {
    if (!recordIds.length) return;
    await this.prisma.absenceRecord.updateMany({
      where: { id: { in: recordIds } },
      data: { payrollItemId },
    });
  }
}
