// ============================================================================
// Auto-waive stale absence flags when attendance is recorded or explained.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { AuditService } from '../../../shared/audit/audit.service';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  mapCorrectionTypeToField,
  parseWorkDateIso,
} from '../../../shared/time/time-correction-field.util';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ABSENCE_REPOSITORY, AbsenceRepository } from '../domain/repositories/absence.repository';

export const PENDING_CHECKIN_CORRECTION_WAIVE_PREFIX = 'มีคำขอแก้ไขเวลาเข้างาน';

export type AbsenceSyncResult = 'waived' | 'restored' | 'unchanged';

@Injectable()
export class AbsenceAutoWaiveService {
  constructor(
    @Inject(ABSENCE_REPOSITORY) private readonly absences: AbsenceRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
  ) {}

  /** Clear a flagged absence once the employee has checked in for that day. */
  async waiveFlaggedWhenCheckedIn(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<boolean> {
    const result = await this.syncForWorkDay(employeeId, companyId, workDate);
    return result === 'waived';
  }

  /** True when check-in exists or a pending check-in correction explains the day. */
  async shouldHoldAbsenceReview(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<boolean> {
    return (await this.hasCheckIn(employeeId, companyId, workDate))
      || (await this.hasPendingCheckInCorrection(employeeId, companyId, workDate));
  }

  /**
   * Keep absence flags aligned with attendance evidence:
   * - checked in → waive
   * - pending check-in correction → waive (hide from review queue)
   * - correction rejected/cancelled with no check-in → restore flagged
   */
  async syncForWorkDay(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<AbsenceSyncResult> {
    const record = await this.absences.findForEmployeeDate(employeeId, companyId, workDate);
    const hasCheckIn = await this.hasCheckIn(employeeId, companyId, workDate);
    const hasPendingCheckInCorrection = await this.hasPendingCheckInCorrection(
      employeeId,
      companyId,
      workDate,
    );

    if (hasCheckIn) {
      if (record?.status !== 'flagged') return 'unchanged';
      await this.waiveRecord(
        record,
        'เช็กอินแล้ว — ยกเลิกการตรวจสอบขาดงานอัตโนมัติ',
        'auto_waive_absence_on_checkin',
      );
      return 'waived';
    }

    if (hasPendingCheckInCorrection) {
      if (record?.status !== 'flagged') return 'unchanged';
      await this.waiveRecord(
        record,
        `${PENDING_CHECKIN_CORRECTION_WAIVE_PREFIX} — รออนุมัติ`,
        'auto_waive_absence_on_pending_correction',
      );
      return 'waived';
    }

    const waiveReason = record?.toPersistence().waiveReason ?? '';
    if (
      record?.status === 'waived'
      && waiveReason.startsWith(PENDING_CHECKIN_CORRECTION_WAIVE_PREFIX)
    ) {
      record.restoreFlagged();
      await this.absences.save(record);
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'AbsenceRecord',
        entityId: record.id,
        action: 'restore_absence_after_correction_rejected',
        after: {
          employeeId,
          companyId,
          workDate: workDate.toISOString().slice(0, 10),
        },
      });
      return 'restored';
    }

    return 'unchanged';
  }

  private async hasCheckIn(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<boolean> {
    const row = await this.prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        companyId,
        workDate,
        deletedAt: null,
        checkInAt: { not: null },
      },
      select: { id: true },
    });
    return !!row;
  }

  private async hasPendingCheckInCorrection(
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<boolean> {
    const workDateIso = workDate.toISOString().slice(0, 10);

    const pendingCorrection = await this.prisma.attendanceCorrection.findFirst({
      where: {
        status: 'pending',
        field: 'checkInAt',
        deletedAt: null,
        attendanceRecord: {
          employeeId,
          companyId,
          workDate,
          deletedAt: null,
        },
      },
      select: { id: true },
    });
    if (pendingCorrection) return true;

    const pendingRequests = await this.prisma.requestInstance.findMany({
      where: {
        requesterEmployeeId: employeeId,
        companyId,
        deletedAt: null,
        status: { in: ['submitted', 'in_review'] },
        requestType: { key: 'time_correction' },
      },
      include: { values: true },
    });

    for (const request of pendingRequests) {
      const values = requestValuesMap(request.values);
      const requestDate = parseWorkDateIso(values.attendanceDate);
      if (requestDate !== workDateIso) continue;
      const correctionType = String(values.correctionType ?? '').trim();
      if (mapCorrectionTypeToField(correctionType) === 'checkInAt') return true;
    }

    return false;
  }

  private async waiveRecord(
    record: NonNullable<Awaited<ReturnType<AbsenceRepository['findForEmployeeDate']>>>,
    reason: string,
    auditAction: string,
  ): Promise<void> {
    const now = this.dates.now();
    record.waive({
      actorUserId: SYSTEM_ACTOR.userId!,
      at: now,
      reason,
    });
    await this.absences.save(record);
    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'AbsenceRecord',
      entityId: record.id,
      action: auditAction,
      after: {
        employeeId: record.employeeId,
        companyId: record.companyId,
        workDate: record.workDate.toISOString().slice(0, 10),
        reason,
      },
    });
  }
}

function requestValuesMap(
  rows: Array<{ fieldKey: string; valueJson: unknown }>,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    out[row.fieldKey] = row.valueJson;
  }
  return out;
}
