// ============================================================================
// modules/attendance/application/attendance-correction.service.ts
// REQ-006b — Time correction end-to-end.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import {
  AttendanceCorrectionResponse,
  CorrectionField,
  CreateAttendanceCorrectionDto,
} from './dto/attendance-correction.dto';
import { AttendanceRecordNotFoundError } from '../domain/errors/attendance.errors';
import { AbsenceAutoWaiveService } from './absence-auto-waive.service';

@Injectable()
export class AttendanceCorrectionService {
  private readonly logger = new Logger(AttendanceCorrectionService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly time: BangkokTimeProvider,
    private readonly telegram: TelegramGatewayService,
    private readonly absenceAutoWaive: AbsenceAutoWaiveService,
  ) {}

  async submit(
    actor: ActorContext,
    employeeId: string,
    dto: CreateAttendanceCorrectionDto,
  ): Promise<AttendanceCorrectionResponse> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);

    const workDate = dto.workDate
      ? this.time.parseWorkDate(dto.workDate)
      : this.time.workDate();

    let record = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, workDate, deletedAt: null },
      include: {
        breaks: { where: { breakEndAt: null }, orderBy: { breakStartAt: 'desc' }, take: 1 },
      },
    });

    if (!record && dto.field === 'checkInAt') {
      const newRecordId = randomUUID();
      await this.prisma.attendanceRecord.create({
        data: {
          id: newRecordId,
          employeeId,
          companyId: dto.companyId,
          workDate,
          status: 'incomplete',
          source: 'telegram',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      record = await this.prisma.attendanceRecord.findFirst({
        where: { id: newRecordId },
        include: { breaks: true },
      });
    }

    if (!record && dto.field !== 'checkInAt') {
      throw new AttendanceRecordNotFoundError(`${employeeId}@${workDate.toISOString().slice(0, 10)}`);
    }

    const correctedAt = new Date(dto.correctedAt);
    const { oldValue, attendanceRecordId } = this.resolveOldValue(
      dto.field,
      record as {
        id: string;
        checkInAt: Date | null;
        checkOutAt: Date | null;
        breaks: Array<{ id: string; breakStartAt: Date; breakEndAt: Date | null }>;
      } | null,
      correctedAt,
    );

    const correctionId = randomUUID();
    await this.prisma.attendanceCorrection.create({
      data: {
        id: correctionId,
        attendanceRecordId,
        requestedBy: actor.userId,
        field: dto.field,
        oldValue: oldValue as Prisma.InputJsonValue,
        newValue: { value: correctedAt.toISOString() } as Prisma.InputJsonValue,
        reason: dto.reason,
        status: 'pending',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'attendance_correction',
      entityId: correctionId,
      companyId: dto.companyId,
      workflowType: 'attendance_correction',
      approvalContext: { employeeId, companyId: dto.companyId },
    });

    await this.prisma.attendanceCorrection.update({
      where: { id: correctionId },
      data: { workflowInstanceId: instanceId },
    });

    await this.audit.record(actor, {
      entityType: 'AttendanceCorrection',
      entityId: correctionId,
      action: 'submitted',
      after: { field: dto.field, workflowInstanceId: instanceId, reason: dto.reason },
    });

    if (dto.field === 'checkInAt') {
      await this.absenceAutoWaive.syncForWorkDay(employeeId, dto.companyId, workDate);
    }

    return {
      id: correctionId,
      attendanceRecordId,
      field: dto.field,
      status: 'pending',
      workflowInstanceId: instanceId,
      reason: dto.reason,
    };
  }

  async notifyRequesterOutcome(
    correctionId: string,
    outcome: 'approved' | 'rejected',
    comment?: string | null,
  ): Promise<void> {
    const correction = await this.prisma.attendanceCorrection.findFirst({
      where: { id: correctionId, deletedAt: null },
      include: {
        requester: { select: { id: true, employeeId: true } },
        attendanceRecord: { select: { workDate: true } },
      },
    });
    if (!correction?.requester) return;

    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId: correction.requestedBy, isActive: true, deletedAt: null },
    });
    if (!account?.chatId) return;

    const icon = outcome === 'approved' ? '✅' : '❌';
    const label = outcome === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติ';
    const lines = [
      `${icon} <b>คำขอแก้ไขเวลา${label}</b>`,
      `ฟิลด์: ${correction.field}`,
      `วันที่: ${correction.attendanceRecord.workDate.toISOString().slice(0, 10)}`,
      comment ? `เหตุผล: ${comment}` : '',
    ].filter(Boolean);

    await this.telegram.sendMessage({
      chatId: Number(account.chatId),
      text: lines.join('\n'),
      parseMode: 'HTML',
      telegramAccountId: account.id,
      messageType: 'correction_outcome',
    }).catch((err) => this.logger.warn('Failed correction outcome notification', err));
  }

  private resolveOldValue(
    field: CorrectionField,
    record: {
      id: string;
      checkInAt: Date | null;
      checkOutAt: Date | null;
      breaks: Array<{ id: string; breakStartAt: Date; breakEndAt: Date | null }>;
    } | null,
    correctedAt: Date,
  ): { oldValue: Record<string, unknown>; attendanceRecordId: string } {
    if (field === 'checkInAt') {
      if (!record) {
        const id = randomUUID();
        return {
          oldValue: { value: null },
          attendanceRecordId: id,
        };
      }
      return {
        oldValue: { value: record.checkInAt?.toISOString() ?? null },
        attendanceRecordId: record.id,
      };
    }

    if (!record) {
      throw new AttendanceRecordNotFoundError('attendance record required');
    }

    if (field === 'checkOutAt') {
      return {
        oldValue: { value: record.checkOutAt?.toISOString() ?? null },
        attendanceRecordId: record.id,
      };
    }

    const openBreak = record.breaks[0];
    if (field === 'breakStartAt') {
      return {
        oldValue: { value: openBreak?.breakStartAt?.toISOString() ?? null },
        attendanceRecordId: record.id,
      };
    }

    if (field === 'breakEndAt') {
      return {
        oldValue: { value: openBreak?.breakEndAt?.toISOString() ?? null },
        attendanceRecordId: record.id,
      };
    }

    return { oldValue: { value: null }, attendanceRecordId: record.id };
  }
}
