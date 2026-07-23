// ============================================================================
// modules/attendance/infrastructure/persistence/attendance.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { AttendanceRecord } from '../../domain/entities/attendance-record.entity';
import {
  AttendanceRepository, OvertimeRepository, OvertimeDraft,
} from '../../domain/repositories/attendance.repository';

@Injectable()
export class PrismaAttendanceRepository implements AttendanceRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<AttendanceRecord | null> {
    const row = await this.prisma.attendanceRecord.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findForEmployeeDate(employeeId: string, workDate: Date): Promise<AttendanceRecord | null> {
    const row = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, workDate, deletedAt: null },
    });
    return row ? this.toDomain(row) : null;
  }

  async findOpenAttendanceRecord(employeeId: string): Promise<AttendanceRecord | null> {
    const row = await this.prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        checkInAt: { not: null },
        checkOutAt: null,
      },
      orderBy: [{ workDate: 'asc' }, { checkInAt: 'asc' }],
    });
    return row ? this.toDomain(row) : null;
  }

  async save(record: AttendanceRecord, actorUserId: string): Promise<void> {
    const p = record.toPersistence();
    await this.prisma.attendanceRecord.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        employeeId: p.employeeId,
        companyId: p.companyId,
        workDate: p.workDate,
        workCategory: p.workCategory,
        shiftId: p.shiftId,
        shiftStartAt: p.shiftStartAt,
        shiftEndAt: p.shiftEndAt,
        checkInAt: p.checkInAt,
        checkOutAt: p.checkOutAt,
        breakStartAt: p.breakStartAt,
        breakEndAt: p.breakEndAt,
        lateMinutes: p.lateMinutes,
        roundedLateHours: new Prisma.Decimal(p.roundedLateHours),
        lateDeduction: new Prisma.Decimal(p.lateDeduction),
        workedMinutes: p.workedMinutes,
        status: p.status,
        source: p.source,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        workCategory: p.workCategory,
        shiftId: p.shiftId,
        shiftStartAt: p.shiftStartAt,
        shiftEndAt: p.shiftEndAt,
        checkInAt: p.checkInAt,
        checkOutAt: p.checkOutAt,
        breakStartAt: p.breakStartAt,
        breakEndAt: p.breakEndAt,
        lateMinutes: p.lateMinutes,
        roundedLateHours: new Prisma.Decimal(p.roundedLateHours),
        lateDeduction: new Prisma.Decimal(p.lateDeduction),
        workedMinutes: p.workedMinutes,
        status: p.status,
        updatedBy: actorUserId,
      },
    });
  }

  async startBreak(recordId: string, at: Date): Promise<void> {
    await this.prisma.breakRecord.create({
      data: { id: randomUUID(), attendanceRecordId: recordId, breakStartAt: at },
    });
    await this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { breakStartAt: at },
    });
  }

  async endOpenBreak(recordId: string, at: Date): Promise<{
    durationMinutes: number;
    breakStartAt: Date;
    breakEndAt: Date;
  } | null> {
    const open = await this.prisma.breakRecord.findFirst({
      where: { attendanceRecordId: recordId, breakEndAt: null },
      orderBy: { breakStartAt: 'desc' },
    });
    if (!open?.breakStartAt) return null;
    const durationMinutes = Math.max(
      0,
      Math.round((at.getTime() - open.breakStartAt.getTime()) / 60000),
    );
    await this.prisma.breakRecord.update({
      where: { id: open.id },
      data: { breakEndAt: at, durationMinutes },
    });
    await this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: { breakEndAt: at },
    });
    return {
      durationMinutes,
      breakStartAt: open.breakStartAt,
      breakEndAt: at,
    };
  }

  private toDomain(row: any): AttendanceRecord {
    return AttendanceRecord.rehydrate({
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      workDate: row.workDate,
      workCategory: row.workCategory === 'wfh' ? 'wfh' : 'office',
      shiftId: row.shiftId,
      shiftStartAt: row.shiftStartAt,
      shiftEndAt: row.shiftEndAt,
      checkInAt: row.checkInAt,
      checkOutAt: row.checkOutAt,
      breakStartAt: row.breakStartAt,
      breakEndAt: row.breakEndAt,
      lateMinutes: row.lateMinutes,
      roundedLateHours: Number(row.roundedLateHours),
      lateDeduction: Number(row.lateDeduction),
      workedMinutes: row.workedMinutes,
      status: row.status as 'present' | 'absent' | 'incomplete' | 'corrected',
      source: row.source,
      deletedAt: row.deletedAt,
    });
  }
}

@Injectable()
export class PrismaOvertimeRepository implements OvertimeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async createPending(draft: OvertimeDraft, actorUserId: string): Promise<string> {
    const id = randomUUID();
    await this.prisma.overtimeRecord.create({
      data: {
        id,
        employeeId: draft.employeeId,
        companyId: draft.companyId,
        attendanceRecordId: draft.attendanceRecordId ?? null,
        workDate: draft.workDate,
        otStartAt: draft.otStartAt ?? null,
        otEndAt: draft.otEndAt ?? null,
        otMinutes: draft.otMinutes ?? null,
        otHours: new Prisma.Decimal(draft.otHours),
        rateApplied: new Prisma.Decimal(draft.rateApplied),
        amount: new Prisma.Decimal(draft.amount),
        reason: draft.reason ?? null,
        status: 'pending',
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
    return id;
  }

  async attachWorkflow(overtimeId: string, workflowInstanceId: string): Promise<void> {
    await this.prisma.overtimeRecord.update({
      where: { id: overtimeId },
      data: { workflowInstanceId },
    });
  }
}
