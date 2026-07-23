// ============================================================================
// Ensures each calendar day has an attendance ledger row for payroll traceability.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import type { EmployeeDayType } from '../domain/services/employee-day-context';

@Injectable()
export class DailyAttendanceLedgerService {
  private readonly logger = new Logger(DailyAttendanceLedgerService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  /** Record a scheduled off-day (leave / monthly off / holiday) when no attendance exists. */
  async recordOffDay(
    employeeId: string,
    companyId: string,
    workDate: Date,
    dayType: Exclude<EmployeeDayType, 'workday'>,
  ): Promise<void> {
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, companyId, workDate, deletedAt: null },
    });
    if (existing?.checkInAt) return;

    const recordId = existing?.id ?? randomUUID();
    if (existing) {
      await this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          status: 'incomplete',
          source: 'correction',
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
    } else {
      await this.prisma.attendanceRecord.create({
        data: {
          id: recordId,
          employeeId,
          companyId,
          workDate,
          status: 'incomplete',
          source: 'correction',
          createdBy: SYSTEM_ACTOR.userId,
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
    }

    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'AttendanceRecord',
      entityId: recordId,
      action: 'day_off_recorded',
      after: {
        dayType,
        workDate: workDate.toISOString().slice(0, 10),
        employeeId,
        companyId,
      },
    });
    this.logger.debug(
      `Off-day ledger employee=${employeeId} date=${workDate.toISOString().slice(0, 10)} type=${dayType}`,
    );
  }

  /** Link absence to attendance ledger for payroll. */
  async recordAbsenceDay(
    employeeId: string,
    companyId: string,
    workDate: Date,
    absenceRecordId: string,
  ): Promise<void> {
    const existing = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, companyId, workDate, deletedAt: null },
    });
    if (existing?.checkInAt) return;

    const recordId = existing?.id ?? randomUUID();
    if (existing) {
      await this.prisma.attendanceRecord.update({
        where: { id: existing.id },
        data: {
          status: 'absent',
          source: 'correction',
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
    } else {
      await this.prisma.attendanceRecord.create({
        data: {
          id: recordId,
          employeeId,
          companyId,
          workDate,
          status: 'absent',
          source: 'correction',
          createdBy: SYSTEM_ACTOR.userId,
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
    }

    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'AttendanceRecord',
      entityId: recordId,
      action: 'absence_day_recorded',
      after: {
        absenceRecordId,
        workDate: workDate.toISOString().slice(0, 10),
        employeeId,
        companyId,
      },
    });
  }
}
