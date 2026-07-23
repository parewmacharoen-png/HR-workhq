import { Injectable } from '@nestjs/common';
import { RequestInstanceStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import { ShiftAssignmentService } from '../../attendance/application/shift-assignment.service';
import { RequestValidationError } from '../domain/errors/request.errors';
import {
  assertNoBreakReportAllowed,
  assertOtOutsideShiftHours,
  assertOtRequestAllowed,
  AttendanceDaySnapshot,
  formatAttendanceContextLines,
  workDateIsoFromRequestValues,
} from './request-attendance-guard.util';

const OPEN_REQUEST_STATUSES: RequestInstanceStatus[] = [
  'draft',
  'submitted',
  'in_review',
  'approved',
];

@Injectable()
export class RequestAttendanceGuardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly bangkok: BangkokTimeProvider,
    private readonly shifts: ShiftAssignmentService,
  ) {}

  async assertAttendanceLinkedRequest(
    typeKey: string,
    employeeId: string,
    companyId: string,
    values: Record<string, unknown>,
    excludeRequestId?: string,
  ): Promise<AttendanceDaySnapshot> {
    const workDateIso = workDateIsoFromRequestValues(typeKey, values);
    if (!workDateIso) {
      throw new RequestValidationError('กรุณาระบุวันที่ให้ถูกต้อง');
    }

    const snapshot = await this.loadDaySnapshot(
      employeeId,
      companyId,
      workDateIso,
      excludeRequestId,
    );

    try {
      if (typeKey === 'ot_request') {
        assertOtRequestAllowed(snapshot);
        assertOtOutsideShiftHours({
          workDateIso,
          startTime: String(values.startTime ?? ''),
          endTime: String(values.endTime ?? ''),
          shiftStartAt: snapshot.shiftStartAt,
          shiftEndAt: snapshot.shiftEndAt,
          shiftName: snapshot.shiftName,
        });
      } else if (typeKey === 'no_break_report') {
        assertNoBreakReportAllowed(snapshot);
      } else {
        return snapshot;
      }
    } catch (err) {
      throw new RequestValidationError(err instanceof Error ? err.message : 'ไม่สามารถส่งคำร้องได้');
    }

    return snapshot;
  }

  async buildApproverAttendanceLines(
    typeKey: string,
    employeeId: string,
    companyId: string,
    values: Record<string, unknown>,
  ): Promise<string[]> {
    if (typeKey !== 'ot_request' && typeKey !== 'no_break_report') return [];
    const workDateIso = workDateIsoFromRequestValues(typeKey, values);
    if (!workDateIso) return [];
    const snapshot = await this.loadDaySnapshot(employeeId, companyId, workDateIso);
    const lines = formatAttendanceContextLines(snapshot, (d) => this.formatBangkokTime(d));
    if (snapshot.shiftStartAt && snapshot.shiftEndAt) {
      const shiftLabel = `${this.formatBangkokTime(snapshot.shiftStartAt)}–${this.formatBangkokTime(snapshot.shiftEndAt)}`;
      lines.push(`🕐 กะปกติ: ${snapshot.shiftName ?? 'กะงาน'} ${shiftLabel}`);
    }
    return lines;
  }

  async loadDaySnapshot(
    employeeId: string,
    companyId: string,
    workDateIso: string,
    excludeRequestId?: string,
  ): Promise<AttendanceDaySnapshot> {
    const workDate = this.bangkok.parseWorkDate(workDateIso);

    const [
      record,
      onApprovedLeave,
      absence,
      existingOtRecords,
      openOtRequests,
      openNoBreakRequests,
      shiftWindow,
    ] = await Promise.all([
      this.prisma.attendanceRecord.findFirst({
        where: { employeeId, companyId, workDate, deletedAt: null },
        include: {
          _count: { select: { breaks: true } },
          shift: { select: { name: true } },
        },
      }),
      this.prisma.leaveRequest.findFirst({
        where: {
          employeeId,
          companyId,
          deletedAt: null,
          status: 'approved',
          startDate: { lte: workDate },
          endDate: { gte: workDate },
        },
        select: { id: true },
      }),
      this.prisma.absenceRecord.findFirst({
        where: {
          employeeId,
          companyId,
          workDate,
          deletedAt: null,
          status: { in: ['flagged', 'approved'] },
        },
        select: { id: true },
      }),
      this.prisma.overtimeRecord.count({
        where: {
          employeeId,
          companyId,
          workDate,
          deletedAt: null,
          status: { in: ['pending', 'approved'] },
        },
      }),
      this.countOpenRequests(employeeId, companyId, 'ot_request', 'otDate', workDateIso, excludeRequestId),
      this.countOpenRequests(employeeId, companyId, 'no_break_report', 'workDate', workDateIso, excludeRequestId),
      this.shifts.resolveShiftWindow(employeeId, companyId, workDate).catch(() => null),
    ]);

    const shiftStartAt = record?.shiftStartAt ?? shiftWindow?.shiftStartAt ?? null;
    const shiftEndAt = record?.shiftEndAt ?? shiftWindow?.shiftEndAt ?? null;
    const shiftName = record?.shift?.name ?? shiftWindow?.shift.name ?? null;

    return {
      recordId: record?.id ?? null,
      checkInAt: record?.checkInAt ?? null,
      checkOutAt: record?.checkOutAt ?? null,
      breakStartAt: record?.breakStartAt ?? null,
      totalBreakMinutes: record?.totalBreakMinutes ?? 0,
      breakRecordCount: record?._count.breaks ?? 0,
      onApprovedLeave: Boolean(onApprovedLeave),
      hasAbsencePenalty: Boolean(absence) && !record?.checkInAt,
      existingOtRecords,
      existingOpenOtRequests: openOtRequests,
      existingOpenNoBreakRequests: openNoBreakRequests,
      shiftStartAt,
      shiftEndAt,
      shiftName,
    };
  }

  private async countOpenRequests(
    employeeId: string,
    companyId: string,
    typeKey: string,
    dateFieldKey: string,
    workDateIso: string,
    excludeRequestId?: string,
  ): Promise<number> {
    const rows = await this.prisma.requestInstance.findMany({
      where: {
        requesterEmployeeId: employeeId,
        companyId,
        deletedAt: null,
        status: { in: OPEN_REQUEST_STATUSES },
        ...(excludeRequestId ? { id: { not: excludeRequestId } } : {}),
        requestType: { key: typeKey, deletedAt: null },
      },
      select: {
        values: {
          where: { fieldKey: dateFieldKey },
          select: { valueJson: true },
        },
      },
    });

    return rows.filter((row) => {
      const raw = row.values[0]?.valueJson;
      const iso = String(raw ?? '').slice(0, 10);
      return iso === workDateIso;
    }).length;
  }

  private formatBangkokTime(value: Date): string {
    return value.toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
  }
}
