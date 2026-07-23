// ============================================================================
// modules/attendance/application/absence-flag.job.ts
// Daily absence flagging — creates AbsenceRecord rows for candidate days.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { Inject } from '@nestjs/common';
import { AbsenceRecord } from '../domain/entities/absence-record.entity';
import { ABSENCE_REPOSITORY, AbsenceRepository } from '../domain/repositories/absence.repository';
import {
  isAbsenceCandidate, isEmployeeActiveOnDate,
} from '../domain/services/absence-detection.service';
import { isOwnerPosition } from '../domain/services/absence-penalty.service';
import { AbsenceFlagResult } from './dto/absence.dto';
import { EmployeeDayContextService } from './employee-day-context.service';
import { DailyAttendanceLedgerService } from './daily-attendance-ledger.service';
import { ShiftAssignmentService } from './shift-assignment.service';
import { AttendanceSettingsService } from '../../settings/application/attendance-settings.service';
import { BANGKOK_TZ } from '../../../shared/time/bangkok-time.provider';
import { AbsenceAutoWaiveService } from './absence-auto-waive.service';

@Injectable()
export class AbsenceFlagJob {
  private readonly logger = new Logger(AbsenceFlagJob.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(ABSENCE_REPOSITORY) private readonly absences: AbsenceRepository,
    private readonly dayContext: EmployeeDayContextService,
    private readonly ledger: DailyAttendanceLedgerService,
    private readonly shifts: ShiftAssignmentService,
    private readonly settings: AttendanceSettingsService,
    private readonly absenceAutoWaive: AbsenceAutoWaiveService,
  ) {}

  async runForCompany(companyId: string, workDate: Date, asOf?: Date): Promise<AbsenceFlagResult> {
    const ref = asOf ?? new Date();
    const nowMinutes = this.bangkokMinutesSinceMidnight(ref);
    const rules = await this.settings.getRules(companyId);
    let flaggedCount = 0;
    let skippedCount = 0;
    let offDayRecordedCount = 0;
    let autoWaivedCount = 0;

    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        companyId,
        effectiveTo: null,
        deletedAt: null,
        employee: { deletedAt: null },
      },
      include: {
        employee: {
          select: {
            id: true,
            position: true,
            employmentStatus: true,
            hireDate: true,
            terminationDate: true,
          },
        },
      },
    });

    const seen = new Set<string>();
    for (const assignment of assignments) {
      if (seen.has(assignment.employeeId)) {
        skippedCount += 1;
        continue;
      }
      seen.add(assignment.employeeId);

      const emp = assignment.employee;
      if (isOwnerPosition(emp.position)) {
        skippedCount += 1;
        continue;
      }
      const isActive = isEmployeeActiveOnDate({
        employmentStatus: emp.employmentStatus,
        hireDate: emp.hireDate,
        terminationDate: emp.terminationDate,
        workDate,
      });
      if (!isActive) {
        skippedCount += 1;
        continue;
      }

      const dayCtx = await this.dayContext.getContext(
        assignment.employeeId,
        companyId,
        workDate,
      );

      if (dayCtx.skipAbsenceFlag) {
        await this.ledger.recordOffDay(
          assignment.employeeId,
          companyId,
          workDate,
          dayCtx.dayType as 'holiday' | 'monthly_off' | 'leave',
        );
        offDayRecordedCount += 1;
        skippedCount += 1;
        continue;
      }

      const shiftWindow = await this.shifts.resolveShiftWindow(
        assignment.employeeId,
        companyId,
        workDate,
      );
      const flagAfterMinutes = shiftWindow.shift.startMinutes + rules.checkInEscalationMinutes;
      if (nowMinutes < flagAfterMinutes) {
        skippedCount += 1;
        continue;
      }

      const attendance = await this.prisma.attendanceRecord.findFirst({
        where: {
          employeeId: assignment.employeeId,
          companyId,
          workDate,
          deletedAt: null,
          checkInAt: { not: null },
        },
      });
      const hasCheckIn = !!attendance;

      const sync = await this.absenceAutoWaive.syncForWorkDay(
        assignment.employeeId,
        companyId,
        workDate,
      );
      if (sync === 'waived') autoWaivedCount += 1;
      if (await this.absenceAutoWaive.shouldHoldAbsenceReview(
        assignment.employeeId,
        companyId,
        workDate,
      )) {
        skippedCount += 1;
        continue;
      }

      if (!isAbsenceCandidate({
        hasApprovedLeave: dayCtx.dayType === 'leave',
        hasApprovedMonthlyOff: dayCtx.dayType === 'monthly_off',
        isHoliday: dayCtx.dayType === 'holiday',
        hasCheckIn,
        isActiveOnDate: true,
      })) {
        skippedCount += 1;
        continue;
      }

      const existing = await this.absences.findForEmployeeDate(
        assignment.employeeId,
        companyId,
        workDate,
      );
      if (existing) {
        skippedCount += 1;
        continue;
      }

      const record = AbsenceRecord.create({
        id: randomUUID(),
        employeeId: assignment.employeeId,
        companyId,
        workDate,
        flaggedReason: 'no_checkin_no_leave',
      });
      await this.absences.save(record);
      await this.ledger.recordAbsenceDay(
        assignment.employeeId,
        companyId,
        workDate,
        record.id,
      );
      flaggedCount += 1;
    }

    this.logger.log(
      `Flag job company=${companyId} date=${workDate.toISOString().slice(0, 10)} `
      + `flagged=${flaggedCount} autoWaived=${autoWaivedCount} offDays=${offDayRecordedCount} skipped=${skippedCount}`,
    );
    return { flaggedCount, skippedCount, offDayRecordedCount, autoWaivedCount };
  }

  private bangkokMinutesSinceMidnight(asOf: Date): number {
    const fmt = new Intl.DateTimeFormat('en-GB', {
      timeZone: BANGKOK_TZ,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = fmt.formatToParts(asOf);
    const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
    const minute = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
    return hour * 60 + minute;
  }
}
