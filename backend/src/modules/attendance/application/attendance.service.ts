// ============================================================================
// modules/attendance/application/attendance.service.ts
// Orchestrates daily attendance. On check-out it runs OT detection; if OT is
// earned it creates a PENDING overtime record and opens an approval workflow
// (overtime is approval-gated per spec). Late deduction uses the provided
// hourly rate (sourced from payroll/formula by the caller).
// ============================================================================

import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
  ForbiddenException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { FormulaResolverService } from '../../formula-engine/application/formula-resolver.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  ATTENDANCE_REPOSITORY, OVERTIME_REPOSITORY,
  AttendanceRepository, OvertimeRepository,
} from '../domain/repositories/attendance.repository';
import { AttendanceRecord } from '../domain/entities/attendance-record.entity';
import {
  AttendanceRulesService,
  toAttendanceRuleParams,
} from '../domain/services/attendance-rules.service';
import { AttendanceAlertService } from './attendance-alert.service';
import {
  AttendanceRecordNotFoundError,
  AlreadyCheckedInError,
  BreakNotStartedError,
  NotCheckedInError,
  OpenShiftNotClosedError,
} from '../domain/errors/attendance.errors';
import {
  CheckInDto, CheckOutDto, AttendanceResponse, CheckOutResult,
} from './dto/attendance.dto';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext, SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { AttendanceSettingsService } from '../../settings/application/attendance-settings.service';
import { AbsenceAutoWaiveService } from './absence-auto-waive.service';
import { AttendanceCorrectionService } from './attendance-correction.service';
import { BangkokTimeProvider, BANGKOK_TZ } from '../../../shared/time/bangkok-time.provider';
import { repairUtcHoursStoredAsBangkok, combineBangkokWorkDateAndTime, normalizeThaiTimeInput } from '../../../shared/time/thai-time-input.util';
import {
  bangkokTimeKey,
  mapCorrectionTypeToField,
  parseWorkDateIso,
} from '../../../shared/time/time-correction-field.util';
import { computeBreakDeduction } from '../../../shared/attendance/break-deduction.util';
import { ShiftAssignmentService } from './shift-assignment.service';
import { EmployeeHourlyRateService } from './employee-hourly-rate.service';
import {
  LEAVE_REPOSITORY,
  LeaveRepository,
} from '../../leave/domain/repositories/leave.repository';
import {
  EmployeeAttendanceHistoryItemDto,
  EmployeeAttendanceHistoryStatus,
  EmployeeAttendanceViewDto,
  EmployeeTodayAttendanceStatus,
} from './dto/employee-attendance-view.dto';
import {
  UpdateAttendanceRecordDto,
  UpdateAttendanceRecordResponse,
} from './dto/update-attendance-record.dto';

@Injectable()
export class AttendanceService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceService.name);

  onModuleInit(): void {
    void this.cleanupInvalidOvertimeRecords()
      .then((removed) => {
        if (removed > 0) {
          this.logger.log(`Cleaned ${removed} invalid OT record(s) without check-in`);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed cleaning invalid OT records: ${message}`);
      });
    void this.repairMiszonedCorrectionTimestamps()
      .then((fixed) => {
        if (fixed > 0) {
          this.logger.log(`Repaired ${fixed} miszoned attendance correction timestamp(s)`);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed repairing miszoned correction timestamps: ${message}`);
      });
    void this.syncZeroWorkedMinutesRecords()
      .then((fixed) => {
        if (fixed > 0) {
          this.logger.log(`Recalculated worked minutes for ${fixed} attendance record(s)`);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed syncing zero worked minutes: ${message}`);
      });
    void this.syncApprovedPlatformTimeCorrections()
      .then((fixed) => {
        if (fixed > 0) {
          this.logger.log(`Applied ${fixed} approved platform time correction(s) on startup`);
        }
      })
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(`Failed syncing approved platform time corrections: ${message}`);
      });
  }

  constructor(
    @Inject(ATTENDANCE_REPOSITORY) private readonly attendance: AttendanceRepository,
    @Inject(OVERTIME_REPOSITORY) private readonly overtime: OvertimeRepository,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly attendanceSettings: AttendanceSettingsService,
    private readonly alertService: AttendanceAlertService,
    private readonly absenceAutoWaive: AbsenceAutoWaiveService,
    private readonly correctionService: AttendanceCorrectionService,
    private readonly time: BangkokTimeProvider,
    @Inject(LEAVE_REPOSITORY) private readonly leaveRepo: LeaveRepository,
    private readonly shiftAssignments: ShiftAssignmentService,
    private readonly hourlyRate: EmployeeHourlyRateService,
    @Optional() private readonly formulaResolver?: FormulaResolverService,
  ) {}

  private async rulesFor(
    companyId: string,
    hourlyRate: number,
  ): Promise<AttendanceRulesService> {
    const config = await this.attendanceSettings.getRules(companyId);
    return new AttendanceRulesService(toAttendanceRuleParams(config, hourlyRate));
  }

  private today(): Date {
    return this.time.workDate();
  }

  /** Oldest open attendance (night shift from a prior calendar day closes before newer rows). */
  private async resolveOpenAttendanceRecord(employeeId: string): Promise<AttendanceRecord | null> {
    return this.attendance.findOpenAttendanceRecord(employeeId);
  }

  async checkIn(actor: ActorContext, employeeId: string, dto: CheckInDto): Promise<AttendanceResponse> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);
    const openRecord = await this.attendance.findOpenAttendanceRecord(employeeId);
    if (openRecord?.checkInAt && !openRecord.checkOutAt) {
      const openDate = openRecord.toPersistence().workDate.toISOString().slice(0, 10);
      const todayIso = this.today().toISOString().slice(0, 10);
      if (openDate !== todayIso) {
        throw new OpenShiftNotClosedError(openDate);
      }
      throw new AlreadyCheckedInError();
    }
    const workDate = this.today();
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { workCategory: true },
    });
    const profileCategory = employee?.workCategory === 'wfh' ? 'wfh' as const : 'office' as const;
    const dayWorkCategory = dto.workCategory === 'wfh' || dto.workCategory === 'office'
      ? dto.workCategory
      : profileCategory;
    let record = await this.attendance.findForEmployeeDate(employeeId, workDate);
    if (!record) {
      record = AttendanceRecord.open({
        id: randomUUID(),
        employeeId,
        companyId: dto.companyId,
        workDate,
        source: 'telegram',
        workCategory: dayWorkCategory,
      });
    }
    const now = this.time.now();
    const hourlyRate = dto.hourlyRate ?? await this.hourlyRate.resolve(employeeId, dto.companyId);
    await this.shiftAssignments.ensureDefaultDayShiftIfUnassigned(
      actor,
      employeeId,
      dto.companyId,
    ).catch(() => undefined);
    const shiftWindow = await this.shiftAssignments.resolveShiftWindow(
      employeeId,
      dto.companyId,
      workDate,
    );
    const rules = await this.rulesFor(dto.companyId, hourlyRate);
    const late = rules.computeLate(now, shiftWindow.shiftStartAt);
    let lateDeduction = late.lateDeduction;
    if (this.formulaResolver) {
      const resolved = await this.formulaResolver.resolveWithFallback(
        'attendance.late_deduction',
        {
          companyId: dto.companyId,
          entityType: 'AttendanceRecord',
          entityId: record.id,
          inputs: {
            lateHours: late.roundedLateHours,
            hourlyRate,
            employeeRole: 0,
            companyId: 0,
          },
          executedBy: actor.userId,
        },
        () => late.lateDeduction,
      );
      lateDeduction = resolved.value;
    }
    record.checkIn(
      now,
      {
        shiftId: shiftWindow.shift.id,
        shiftStartAt: shiftWindow.shiftStartAt,
        shiftEndAt: shiftWindow.shiftEndAt,
      },
      {
        lateMinutes: late.lateMinutes,
        roundedLateHours: late.roundedLateHours,
        lateDeduction,
      },
      dayWorkCategory,
    );
    await this.attendance.save(record, actor.userId);
    await this.audit.record(actor, {
      entityType: 'AttendanceRecord', entityId: record.id, action: 'check_in',
      after: record.toPersistence(),
    });
    await this.alertService.resolveAlertsForEmployee(employeeId, workDate, 'check_in');
    await this.absenceAutoWaive.syncForWorkDay(employeeId, dto.companyId, workDate);
    return this.toResponse(record, shiftWindow.shift.name);
  }

  async checkOut(actor: ActorContext, employeeId: string, dto: CheckOutDto): Promise<CheckOutResult> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);
    const record = await this.resolveOpenAttendanceRecord(employeeId);
    if (!record) {
      throw new NotCheckedInError();
    }
    const workDate = record.toPersistence().workDate;
    if (!record.checkInAt) throw new NotCheckedInError();

    const now = this.time.now();
    const rules = await this.rulesFor(dto.companyId, 0);
    const worked = rules.computeWorkedMinutes(record.checkInAt!, now);
    record.checkOut(now, worked);
    await this.recalculateBreakDeduction(record.id, employeeId, dto.companyId, workDate);
    await this.attendance.save(record, actor.userId);

    await this.audit.record(actor, {
      entityType: 'AttendanceRecord', entityId: record.id, action: 'check_out',
      after: record.toPersistence(),
    });
    await this.alertService.resolveAlertsForEmployee(employeeId, workDate, 'check_out');
    await this.absenceAutoWaive.syncForWorkDay(employeeId, dto.companyId, workDate);
    const shiftWindow = await this.shiftAssignments.resolveShiftWindow(
      employeeId,
      dto.companyId,
      workDate,
    );
    return { ...this.toResponse(record, shiftWindow.shift.name), overtime: null };
  }

  async submitOvertimeRequest(
    actor: ActorContext,
    employeeId: string,
    dto: {
      companyId: string;
      attendanceRecordId: string;
      otEndAt?: Date;
      reason?: string;
    },
  ): Promise<CheckOutResult['overtime']> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);
    const record = await this.attendance.findById(dto.attendanceRecordId);
    if (!record || record.employeeId !== employeeId) {
      throw new AttendanceRecordNotFoundError(dto.attendanceRecordId);
    }
    if (!record.checkOutAt) throw new NotCheckedInError();

    const config = await this.attendanceSettings.getRules(dto.companyId);
    const otEndAt = dto.otEndAt ?? this.time.now();
    const otStartAt = record.shiftEndAt ?? record.checkOutAt;
    const rules = await this.rulesFor(dto.companyId, 0);
    const ot = rules.computeOvertimeFromEnd(otStartAt!, otEndAt);
    if (ot.otHours < 1) {
      return null;
    }

    const overtimeId = await this.overtime.createPending(
      {
        employeeId,
        companyId: dto.companyId,
        attendanceRecordId: record.id,
        workDate: this.today(),
        otStartAt: otStartAt!,
        otEndAt,
        otMinutes: ot.otMinutes,
        otHours: ot.otHours,
        rateApplied: config.otHourlyRate,
        amount: ot.amount,
        reason: dto.reason ?? null,
      },
      actor.userId,
    );
    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'overtime',
      entityId: overtimeId,
      companyId: dto.companyId,
      workflowType: 'ot_request',
      approvalContext: { employeeId, companyId: dto.companyId },
    });
    await this.overtime.attachWorkflow(overtimeId, instanceId);
    return { otHours: ot.otHours, amount: ot.amount, workflowInstanceId: instanceId };
  }

  async startBreak(actor: ActorContext, employeeId: string): Promise<{ startedAt: Date }> {
    const record = await this.resolveOpenAttendanceRecord(employeeId);
    if (!record) throw new NotCheckedInError();
    const workDate = record.toPersistence().workDate;
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, record.toPersistence().companyId);
    const startedAt = this.time.now();
    await this.attendance.startBreak(record.id, startedAt);
    await this.audit.record(actor, {
      entityType: 'AttendanceRecord', entityId: record.id, action: 'break_start',
    });
    return { startedAt };
  }

  async endBreak(actor: ActorContext, employeeId: string): Promise<{
    durationMinutes: number;
    allowedMinutes: number;
    overageMinutes: number;
    onTime: boolean;
    breakStartAt: Date;
    breakEndAt: Date;
  }> {
    const record = await this.resolveOpenAttendanceRecord(employeeId);
    if (!record) throw new NotCheckedInError();
    const companyId = record.toPersistence().companyId;
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, companyId);
    const workDate = record.toPersistence().workDate;
    const ended = await this.attendance.endOpenBreak(record.id, this.time.now());
    if (!ended) throw new BreakNotStartedError();
    await this.recalculateBreakDeduction(
      record.id,
      employeeId,
      companyId,
      workDate,
    );
    await this.audit.record(actor, {
      entityType: 'AttendanceRecord', entityId: record.id, action: 'break_end',
    });
    await this.alertService.resolveAlertsForEmployee(employeeId, workDate, 'break_end');

    const rules = await this.attendanceSettings.getRules(companyId);
    const allowedMinutes = rules.breakMinutes;
    const overageMinutes = Math.max(0, ended.durationMinutes - allowedMinutes);
    return {
      durationMinutes: ended.durationMinutes,
      allowedMinutes,
      overageMinutes,
      onTime: overageMinutes === 0,
      breakStartAt: ended.breakStartAt,
      breakEndAt: ended.breakEndAt,
    };
  }

  private async recalculateBreakDeduction(
    recordId: string,
    employeeId: string,
    companyId: string,
    workDate: Date,
  ): Promise<void> {
    const breaks = await this.prisma.breakRecord.findMany({
      where: { attendanceRecordId: recordId },
      select: { breakStartAt: true, breakEndAt: true, durationMinutes: true },
    });

    let totalBreakMinutes = 0;
    for (const row of breaks) {
      if (row.durationMinutes != null) {
        totalBreakMinutes += row.durationMinutes;
      } else if (row.breakStartAt) {
        totalBreakMinutes += Math.max(
          0,
          Math.round((this.time.now().getTime() - row.breakStartAt.getTime()) / 60000),
        );
      }
    }

    const hourlyRate = await this.hourlyRate.resolve(employeeId, companyId);
    const rules = await this.attendanceSettings.getRules(companyId);
    const result = computeBreakDeduction(totalBreakMinutes, rules, hourlyRate);

    if (result.tier === 'absence') {
      const existing = await this.prisma.absenceRecord.findFirst({
        where: { employeeId, companyId, workDate, deletedAt: null },
      });
      if (!existing) {
        await this.prisma.absenceRecord.create({
          data: {
            id: randomUUID(),
            employeeId,
            companyId,
            workDate,
            status: 'flagged',
            flaggedReason: 'break_exceeds_absence_threshold',
          },
        });
      }
    }

    await this.prisma.attendanceRecord.update({
      where: { id: recordId },
      data: {
        totalBreakMinutes,
        breakDeduction: result.breakDeduction,
        breakPenaltyTier: result.tier,
      },
    });
  }

  /** Recalculate worked minutes after a time correction is applied. */
  async syncWorkedMinutesAfterCorrection(attendanceRecordId: string): Promise<void> {
    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id: attendanceRecordId, deletedAt: null },
      select: {
        id: true,
        employeeId: true,
        companyId: true,
        workDate: true,
        checkInAt: true,
        checkOutAt: true,
      },
    });
    if (!record?.checkInAt || !record.checkOutAt) return;

    const rules = await this.rulesFor(record.companyId, 0);
    const workedMinutes = rules.computeWorkedMinutes(record.checkInAt, record.checkOutAt);
    await this.prisma.attendanceRecord.update({
      where: { id: record.id },
      data: { workedMinutes },
    });
    await this.recalculateBreakDeduction(
      record.id,
      record.employeeId,
      record.companyId,
      record.workDate,
    );
  }

  /** Fix legacy correction timestamps (UTC hours stored instead of Bangkok +07:00). */
  async repairMiszonedCorrectionTimestamps(employeeId?: string): Promise<number> {
    const corrections = await this.prisma.attendanceCorrection.findMany({
      where: {
        status: 'approved',
        deletedAt: null,
        field: { in: ['checkInAt', 'checkOutAt'] },
        ...(employeeId
          ? { attendanceRecord: { employeeId, deletedAt: null } }
          : { attendanceRecord: { deletedAt: null } }),
      },
      include: { attendanceRecord: { select: { id: true, workDate: true } } },
    });

    let fixed = 0;
    for (const correction of corrections) {
      const raw = correction.newValue as { value?: string } | null;
      const wrongIso = raw?.value;
      if (!wrongIso) continue;

      const workDateIso = correction.attendanceRecord.workDate.toISOString().slice(0, 10);
      const repaired = repairUtcHoursStoredAsBangkok(wrongIso, workDateIso);
      if (!repaired) continue;

      const field = correction.field as 'checkInAt' | 'checkOutAt';
      const record = await this.prisma.attendanceRecord.findFirst({
        where: { id: correction.attendanceRecordId, deletedAt: null },
        select: { checkInAt: true, checkOutAt: true },
      });
      if (!record) continue;
      const current = field === 'checkInAt' ? record.checkInAt : record.checkOutAt;
      if (!current || current.toISOString() !== new Date(wrongIso).toISOString()) continue;

      await this.prisma.attendanceRecord.update({
        where: { id: correction.attendanceRecordId },
        data: { [field]: repaired, updatedBy: SYSTEM_ACTOR.userId },
      });
      await this.prisma.attendanceCorrection.update({
        where: { id: correction.id },
        data: {
          newValue: { value: repaired.toISOString() },
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
      await this.syncWorkedMinutesAfterCorrection(correction.attendanceRecordId);
      fixed += 1;
    }
    return fixed;
  }

  /** Recalculate worked minutes when check-in/out exist but total is still zero. */
  async syncZeroWorkedMinutesRecords(employeeId?: string): Promise<number> {
    const records = await this.prisma.attendanceRecord.findMany({
      where: {
        deletedAt: null,
        checkInAt: { not: null },
        checkOutAt: { not: null },
        workedMinutes: 0,
        ...(employeeId ? { employeeId } : {}),
      },
      select: { id: true },
    });
    for (const record of records) {
      await this.syncWorkedMinutesAfterCorrection(record.id);
    }
    return records.length;
  }

  /**
   * Apply approved Request Platform time_correction requests when attendance still
   * does not match the approved time (e.g. integration marked completed but drifted).
   */
  async syncApprovedPlatformTimeCorrections(employeeId?: string): Promise<number> {
    const requests = await this.prisma.requestInstance.findMany({
      where: {
        deletedAt: null,
        status: 'approved',
        requestType: { key: 'time_correction' },
        ...(employeeId ? { requesterEmployeeId: employeeId } : {}),
      },
      include: { values: true },
      orderBy: { approvedAt: 'asc' },
    });

    let fixed = 0;
    for (const req of requests) {
      const values: Record<string, unknown> = {};
      for (const row of req.values) {
        if (row.valueJson !== null && row.valueJson !== undefined) {
          values[row.fieldKey] = row.valueJson;
        } else if (row.valueText != null && row.valueText !== '') {
          values[row.fieldKey] = row.valueText;
        }
      }

      const workDateIso = parseWorkDateIso(values.attendanceDate);
      const correctionType = String(values.correctionType ?? '').trim();
      const requestedTime = normalizeThaiTimeInput(String(values.requestedTime ?? '').trim())
        ?? String(values.requestedTime ?? '').trim();
      if (!workDateIso || !correctionType || !requestedTime) continue;

      const field = mapCorrectionTypeToField(correctionType);
      if (field !== 'checkInAt' && field !== 'checkOutAt') continue;

      const correctedAt = combineBangkokWorkDateAndTime(workDateIso, requestedTime);
      if (!correctedAt) continue;

      const record = await this.prisma.attendanceRecord.findFirst({
        where: {
          employeeId: req.requesterEmployeeId,
          companyId: req.companyId,
          workDate: new Date(`${workDateIso}T00:00:00.000Z`),
          deletedAt: null,
        },
      });
      if (!record) continue;

      const current = field === 'checkInAt' ? record.checkInAt : record.checkOutAt;
      if (current && Math.abs(current.getTime() - correctedAt.getTime()) < 60_000) continue;
      if (current && bangkokTimeKey(current) === bangkokTimeKey(correctedAt)) continue;

      await this.prisma.attendanceRecord.update({
        where: { id: record.id },
        data: {
          [field]: correctedAt,
          status: 'corrected',
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });

      if (req.integrationEntityId) {
        await this.prisma.attendanceCorrection.updateMany({
          where: { id: req.integrationEntityId, deletedAt: null },
          data: {
            newValue: { value: correctedAt.toISOString() },
            status: 'approved',
            updatedBy: SYSTEM_ACTOR.userId,
          },
        });
      }

      await this.syncWorkedMinutesAfterCorrection(record.id);
      fixed += 1;
      this.logger.log(
        `Synced approved time correction ${req.id} → ${field} ${bangkokTimeKey(correctedAt)} on ${workDateIso}`,
      );
    }
    return fixed;
  }

  /**
   * Outbox handler: called when an attendance_correction workflow resolves.
   * The entityId is the AttendanceCorrection.id (stored as workflowInstanceId
   * on the correction record via the workflow.entityId column).
   *
   * On approval: applies the corrected field value to the AttendanceRecord.
   * On rejection/cancellation: marks the correction as rejected, no field update.
   */
  async onCorrectionWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    const correction = await this.prisma.attendanceCorrection.findFirst({
      where: { id: entityId, deletedAt: null },
      include: { attendanceRecord: true },
    });
    if (!correction) {
      this.logger.warn(`onCorrectionWorkflowResolved: no correction found for id=${entityId}`);
      return;
    }

    if (status === 'approved') {
      const newValue = correction.newValue as Record<string, unknown> | null;
      const iso = (newValue?.['value'] ?? newValue) as string | null;
      const correctedAt = iso ? new Date(iso) : null;

      if (correctedAt && correction.field) {
        if (correction.field === 'checkInAt' || correction.field === 'checkOutAt') {
          await this.prisma.attendanceRecord.update({
            where: { id: correction.attendanceRecordId },
            data: {
              [correction.field]: correctedAt,
              status: 'corrected',
              updatedBy: SYSTEM_ACTOR.userId,
            },
          });
          await this.syncWorkedMinutesAfterCorrection(correction.attendanceRecordId);
        } else if (correction.field === 'breakStartAt') {
          const open = await this.prisma.breakRecord.findFirst({
            where: { attendanceRecordId: correction.attendanceRecordId, breakEndAt: null },
            orderBy: { breakStartAt: 'desc' },
          });
          if (open) {
            await this.prisma.breakRecord.update({
              where: { id: open.id },
              data: { breakStartAt: correctedAt },
            });
          } else {
            await this.prisma.breakRecord.create({
              data: {
                id: randomUUID(),
                attendanceRecordId: correction.attendanceRecordId,
                breakStartAt: correctedAt,
              },
            });
          }
        } else if (correction.field === 'breakEndAt') {
          const open = await this.prisma.breakRecord.findFirst({
            where: { attendanceRecordId: correction.attendanceRecordId, breakEndAt: null },
            orderBy: { breakStartAt: 'desc' },
          });
          if (open) {
            const duration = open.breakStartAt
              ? Math.max(0, Math.round((correctedAt.getTime() - open.breakStartAt.getTime()) / 60000))
              : null;
            await this.prisma.breakRecord.update({
              where: { id: open.id },
              data: { breakEndAt: correctedAt, durationMinutes: duration ?? undefined },
            });
          }
        }
      }
      await this.prisma.attendanceCorrection.update({
        where: { id: correction.id },
        data: { status: 'approved' },
      });
      this.logger.log(`Attendance correction ${correction.id} approved — field "${correction.field}" updated`);
    } else {
      await this.prisma.attendanceCorrection.update({
        where: { id: correction.id },
        data: { status: 'rejected' },
      });
      this.logger.log(`Attendance correction ${correction.id} ${status} — no field update applied`);
    }

    if (correction.field === 'checkInAt') {
      const record = correction.attendanceRecord;
      await this.absenceAutoWaive.syncForWorkDay(
        record.employeeId,
        record.companyId,
        record.workDate,
      );
    }

    await this.correctionService.notifyRequesterOutcome(
      correction.id,
      status === 'approved' ? 'approved' : 'rejected',
    );
  }

  /**
   * Outbox handler: overtime workflow resolved.
   * On approval: create PayrollItem in the open cycle and link to OvertimeRecord.
   * On rejection/cancellation: mark OvertimeRecord as rejected.
   */
  async linkApprovedOtToOpenPayroll(otId: string): Promise<void> {
    const ot = await this.prisma.overtimeRecord.findFirst({
      where: { id: otId, deletedAt: null },
    });
    if (!ot || ot.payrollItemId) return;

    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { companyId: ot.companyId, status: 'open', deletedAt: null },
      orderBy: { periodStart: 'desc' },
    });
    if (!cycle) {
      this.logger.warn(`linkApprovedOtToOpenPayroll: no open payroll cycle for company ${ot.companyId}`);
      await this.prisma.overtimeRecord.update({
        where: { id: ot.id },
        data: { status: 'approved', updatedBy: SYSTEM_ACTOR.userId },
      });
      return;
    }

    const itemId = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.payrollItem.create({
        data: {
          id: itemId,
          payrollCycleId: cycle.id,
          employeeId: ot.employeeId,
          companyId: ot.companyId,
          itemType: 'ot',
          amount: ot.amount,
          quantity: ot.otHours,
          sourceRefType: 'overtime',
          sourceRefId: ot.id,
          note: `OT อนุมัติแล้ว (${ot.workDate.toISOString().slice(0, 10)})`,
          createdBy: SYSTEM_ACTOR.userId,
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
      await tx.overtimeRecord.update({
        where: { id: ot.id },
        data: {
          status: 'approved',
          payrollItemId: itemId,
          updatedBy: SYSTEM_ACTOR.userId,
        },
      });
    });
    this.logger.log(`OT ${ot.id} linked to PayrollItem ${itemId}`);
  }

  async onOvertimeWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    const ot = await this.prisma.overtimeRecord.findFirst({
      where: { id: entityId, deletedAt: null },
    });
    if (!ot) {
      this.logger.warn(`onOvertimeWorkflowResolved: OvertimeRecord ${entityId} not found`);
      return;
    }

    if (status === 'approved') {
      await this.linkApprovedOtToOpenPayroll(entityId);
      return;
    }
    await this.prisma.overtimeRecord.update({
      where: { id: ot.id },
      data: { status: 'rejected', updatedBy: SYSTEM_ACTOR.userId },
    });
    this.logger.log(`OT ${ot.id} ${status} — marked rejected`);
  }

  async getEmployeeAttendanceView(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeeAttendanceViewDto> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, companyId);
    await this.repairMiszonedCorrectionTimestamps(employeeId);
    await this.syncZeroWorkedMinutesRecords(employeeId);
    await this.syncApprovedPlatformTimeCorrections(employeeId);

    const today = this.time.workDate();
    const monthStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
    const historyStart = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 11, 1));

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { workCategory: true },
    });
    const shiftProfile = await this.prisma.adminCommissionEmployeeProfile.findFirst({
      where: { employeeId, companyId, deletedAt: null },
      select: { defaultShift: true },
    });
    const shift = shiftProfile?.defaultShift ?? null;
    const defaultWorkCategory = employee?.workCategory === 'wfh' ? 'wfh' : 'office';
    const attendanceRules = await this.attendanceSettings.getRules(companyId);
    const breakAllowedMinutes = Math.max(0, attendanceRules.breakMinutes ?? 0);

    const [
      todayRecord,
      monthRecords,
      historyRecords,
      monthOtRecords,
      historyOtRecords,
      monthAbsences,
      historyAbsences,
      approvedLeaves,
    ] = await Promise.all([
      this.prisma.attendanceRecord.findFirst({
        where: { employeeId, companyId, workDate: today, deletedAt: null },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { employeeId, companyId, workDate: { gte: monthStart }, deletedAt: null },
      }),
      this.prisma.attendanceRecord.findMany({
        where: { employeeId, companyId, workDate: { gte: historyStart }, deletedAt: null },
        orderBy: { workDate: 'desc' },
        take: 500,
      }),
      this.prisma.overtimeRecord.findMany({
        where: {
          employeeId,
          companyId,
          workDate: { gte: monthStart },
          deletedAt: null,
          status: 'approved',
        },
      }),
      this.prisma.overtimeRecord.findMany({
        where: {
          employeeId,
          companyId,
          workDate: { gte: historyStart },
          deletedAt: null,
          status: 'approved',
        },
      }),
      this.prisma.absenceRecord.findMany({
        where: { employeeId, companyId, workDate: { gte: monthStart }, deletedAt: null },
      }),
      this.prisma.absenceRecord.findMany({
        where: { employeeId, companyId, workDate: { gte: historyStart }, deletedAt: null },
      }),
      this.prisma.leaveRequest.findMany({
        where: {
          employeeId,
          companyId,
          status: 'approved',
          deletedAt: null,
          endDate: { gte: historyStart },
          startDate: { lte: monthEnd },
        },
        select: {
          id: true,
          startDate: true,
          endDate: true,
          leaveType: { select: { code: true, name: true } },
        },
      }),
    ]);

    const breakRows = historyRecords.length
      ? await this.prisma.breakRecord.findMany({
        where: { attendanceRecordId: { in: historyRecords.map((row) => row.id) } },
        select: { attendanceRecordId: true, durationMinutes: true },
      })
      : [];

    const breakMinutesByRecord = new Map<string, number>();
    for (const row of breakRows) {
      const current = breakMinutesByRecord.get(row.attendanceRecordId) ?? 0;
      breakMinutesByRecord.set(
        row.attendanceRecordId,
        current + (row.durationMinutes ?? 0),
      );
    }

    const otHoursByDate = new Map<string, number>();
    const otMetaByDate = new Map<string, {
      id: string;
      startAt: string | null;
      endAt: string | null;
      reason: string | null;
    }>();
    for (const row of historyOtRecords) {
      const key = row.workDate.toISOString().slice(0, 10);
      otHoursByDate.set(key, (otHoursByDate.get(key) ?? 0) + Number(row.otHours ?? 0));
      const existing = otMetaByDate.get(key);
      if (!existing) {
        otMetaByDate.set(key, {
          id: row.id,
          startAt: row.otStartAt?.toISOString() ?? null,
          endAt: row.otEndAt?.toISOString() ?? null,
          reason: row.reason ?? null,
        });
      } else {
        // Keep earliest start / latest end when multiple OT rows exist.
        if (row.otStartAt) {
          const startIso = row.otStartAt.toISOString();
          if (!existing.startAt || startIso < existing.startAt) existing.startAt = startIso;
        }
        if (row.otEndAt) {
          const endIso = row.otEndAt.toISOString();
          if (!existing.endAt || endIso > existing.endAt) existing.endAt = endIso;
        }
        if (!existing.reason && row.reason) existing.reason = row.reason;
      }
    }

    const absenceDates = new Set(
      historyAbsences.map((row) => row.workDate.toISOString().slice(0, 10)),
    );

    const monthlyOffDates = new Set<string>();
    const monthlyOffRows = await this.prisma.monthlyOffRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
      },
      select: { selectedDates: true },
    });
    for (const row of monthlyOffRows) {
      const dates = Array.isArray(row.selectedDates) ? row.selectedDates as string[] : [];
      for (const d of dates) monthlyOffDates.add(d);
    }

    const leaveByDate = new Map<string, { code: string; name: string; leaveId: string }>();
    for (const leave of approvedLeaves) {
      const from = leave.startDate.toISOString().slice(0, 10);
      const to = leave.endDate.toISOString().slice(0, 10);
      const cursor = new Date(`${from}T00:00:00.000Z`);
      const endDate = new Date(`${to}T00:00:00.000Z`);
      while (cursor <= endDate) {
        const iso = cursor.toISOString().slice(0, 10);
        if (!leaveByDate.has(iso)) {
          leaveByDate.set(iso, {
            code: leave.leaveType.code,
            name: leave.leaveType.name,
            leaveId: leave.id,
          });
        }
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
    }
    const onLeave = (date: Date) => leaveByDate.has(date.toISOString().slice(0, 10));
    const onMonthlyOff = (date: Date) => monthlyOffDates.has(date.toISOString().slice(0, 10));

    const todayStatus = await this.resolveTodayStatus(
      employeeId,
      companyId,
      today,
      todayRecord,
      onLeave(today),
      onMonthlyOff(today),
    );

    const latest = await this.prisma.attendanceRecord.findFirst({
      where: { employeeId, companyId, deletedAt: null, checkInAt: { not: null } },
      orderBy: { workDate: 'desc' },
    });

    const dayCategory = (row: { workCategory?: string | null }) =>
      row.workCategory === 'wfh' ? 'wfh' : (row.workCategory === 'office' ? 'office' : defaultWorkCategory);

    const monthStartIso = monthStart.toISOString().slice(0, 10);
    const monthEndIso = monthEnd.toISOString().slice(0, 10);

    const historyByDate = new Map<string, EmployeeAttendanceHistoryItemDto>();
    for (const row of historyRecords) {
      const date = row.workDate.toISOString().slice(0, 10);
      const leaveInfo = leaveByDate.get(date);
      const otHours = Math.round((otHoursByDate.get(date) ?? 0) * 100) / 100;
      const status = this.resolveHistoryStatus(
        row,
        Boolean(leaveInfo),
        onMonthlyOff(row.workDate),
        absenceDates.has(date),
      );
      const otMeta = otMetaByDate.get(date) ?? null;
      // OT is only valid with a real check-in and not on leave/holiday.
      const otValid = otHours > 0
        && Boolean(row.checkInAt)
        && status !== 'leave'
        && status !== 'holiday';
      const showOt = otHours > 0 && status !== 'leave';
      const breakMinutes = row.totalBreakMinutes
        ?? breakMinutesByRecord.get(row.id)
        ?? 0;
      const breakDeduction = Number(row.breakDeduction ?? 0);
      const breakOverageMinutes = Math.max(0, breakMinutes - breakAllowedMinutes);
      historyByDate.set(date, {
        id: row.id,
        date,
        shift,
        checkInAt: row.checkInAt?.toISOString() ?? null,
        checkOutAt: row.checkOutAt?.toISOString() ?? null,
        breakMinutes,
        breakAllowedMinutes,
        breakOverageMinutes,
        breakDeduction,
        breakPenaltyTier: row.breakPenaltyTier ?? null,
        workedHours: Math.round((row.workedMinutes / 60) * 100) / 100,
        otHours: showOt ? otHours : 0,
        otStartAt: showOt ? (otMeta?.startAt ?? null) : null,
        otEndAt: showOt ? (otMeta?.endAt ?? null) : null,
        otReason: showOt ? (otMeta?.reason ?? null) : null,
        overtimeRecordId: showOt ? (otMeta?.id ?? null) : null,
        otValid: showOt ? otValid : undefined,
        lateMinutes: row.lateMinutes,
        status,
        workCategory: dayCategory(row),
        leaveTypeCode: status === 'leave' ? (leaveInfo?.code ?? null) : null,
        leaveTypeName: status === 'leave' ? (leaveInfo?.name ?? null) : null,
        leaveRequestId: status === 'leave' ? (leaveInfo?.leaveId ?? null) : null,
      });
    }

    // Leave days without an attendance row still appear on the calendar with type.
    for (const [date, leaveInfo] of leaveByDate) {
      if (historyByDate.has(date)) continue;
      if (date < historyStart.toISOString().slice(0, 10)) continue;
      historyByDate.set(date, {
        id: `leave:${leaveInfo.leaveId}:${date}`,
        date,
        shift: null,
        checkInAt: null,
        checkOutAt: null,
        breakMinutes: 0,
        workedHours: 0,
        otHours: 0,
        otStartAt: null,
        otEndAt: null,
        otReason: null,
        overtimeRecordId: null,
        otValid: undefined,
        lateMinutes: 0,
        status: 'leave',
        workCategory: defaultWorkCategory,
        leaveTypeCode: leaveInfo.code,
        leaveTypeName: leaveInfo.name,
        leaveRequestId: leaveInfo.leaveId,
      });
    }

    // Invalid OT without attendance: keep visible for HR cleanup, status stays absent.
    for (const [date, hours] of otHoursByDate) {
      if (hours <= 0 || historyByDate.has(date)) continue;
      if (date < historyStart.toISOString().slice(0, 10)) continue;
      const otMeta = otMetaByDate.get(date);
      historyByDate.set(date, {
        id: `ot-only:${date}`,
        date,
        shift,
        checkInAt: null,
        checkOutAt: null,
        breakMinutes: 0,
        workedHours: 0,
        otHours: Math.round(hours * 100) / 100,
        otStartAt: otMeta?.startAt ?? null,
        otEndAt: otMeta?.endAt ?? null,
        otReason: otMeta?.reason ?? null,
        overtimeRecordId: otMeta?.id ?? null,
        otValid: false,
        lateMinutes: 0,
        status: 'absent',
        workCategory: defaultWorkCategory,
        leaveTypeCode: null,
        leaveTypeName: null,
        leaveRequestId: null,
      });
    }

    // Absence-flagged days without an attendance row.
    for (const absence of historyAbsences) {
      const date = absence.workDate.toISOString().slice(0, 10);
      if (historyByDate.has(date)) continue;
      if (date < historyStart.toISOString().slice(0, 10)) continue;
      if (leaveByDate.has(date) || monthlyOffDates.has(date)) continue;
      historyByDate.set(date, {
        id: `absence:${absence.id}`,
        date,
        shift,
        checkInAt: null,
        checkOutAt: null,
        breakMinutes: 0,
        workedHours: 0,
        otHours: 0,
        otStartAt: null,
        otEndAt: null,
        otReason: null,
        overtimeRecordId: null,
        otValid: undefined,
        lateMinutes: 0,
        status: 'absent',
        workCategory: defaultWorkCategory,
        leaveTypeCode: null,
        leaveTypeName: null,
        leaveRequestId: null,
      });
    }

    // Holiday days without an attendance row.
    for (const date of monthlyOffDates) {
      if (historyByDate.has(date)) continue;
      if (date < historyStart.toISOString().slice(0, 10)) continue;
      historyByDate.set(date, {
        id: `holiday:${date}`,
        date,
        shift: null,
        checkInAt: null,
        checkOutAt: null,
        breakMinutes: 0,
        workedHours: 0,
        otHours: 0,
        otStartAt: null,
        otEndAt: null,
        otReason: null,
        overtimeRecordId: null,
        otValid: undefined,
        lateMinutes: 0,
        status: 'holiday',
        workCategory: defaultWorkCategory,
        leaveTypeCode: null,
        leaveTypeName: null,
        leaveRequestId: null,
      });
    }

    const history = [...historyByDate.values()].sort((a, b) => b.date.localeCompare(a.date));

    // Summary cards must use the same day list as the detail modal (unique dates).
    const monthHistoryItems = history.filter(
      (row) => row.date >= monthStartIso && row.date <= monthEndIso,
    );
    const isWorkStatus = (status: string) => (
      status === 'working' || status === 'checked_out' || status === 'late'
    );
    const workingDaysMonth = monthHistoryItems.filter((row) => isWorkStatus(row.status)).length;
    const lateCountMonth = monthHistoryItems.filter(
      (row) => row.status === 'late' || row.lateMinutes > 0,
    ).length;
    const absentCountMonth = monthHistoryItems.filter((row) => row.status === 'absent').length;
    const holidayDaysMonth = monthHistoryItems.filter((row) => row.status === 'holiday').length;
    const leaveDaysMonth = monthHistoryItems.filter((row) => row.status === 'leave').length;
    const officeDaysMonth = monthHistoryItems.filter(
      (row) => isWorkStatus(row.status) && row.workCategory === 'office',
    ).length;
    const wfhDaysMonth = monthHistoryItems.filter(
      (row) => isWorkStatus(row.status) && row.workCategory === 'wfh',
    ).length;
    const otHoursMonth = monthHistoryItems.reduce((sum, row) => sum + (row.otHours ?? 0), 0);
    const breakOverCountMonth = monthHistoryItems.filter(
      (row) => (row.breakDeduction ?? 0) > 0 || (row.breakOverageMinutes ?? 0) > 0,
    ).length;

    return {
      summary: {
        todayStatus,
        lastCheckInAt: latest?.checkInAt?.toISOString() ?? null,
        lastCheckOutAt: latest?.checkOutAt?.toISOString() ?? null,
        lateCountMonth,
        absentCountMonth,
        otHoursMonth: Math.round(otHoursMonth * 100) / 100,
        workingDaysMonth,
        officeDaysMonth,
        wfhDaysMonth,
        holidayDaysMonth,
        leaveDaysMonth,
        breakOverCountMonth,
      },
      history,
    };
  }

  private async resolveTodayStatus(
    employeeId: string,
    companyId: string,
    today: Date,
    todayRecord: { checkInAt: Date | null; checkOutAt: Date | null } | null,
    onLeaveToday: boolean,
    onMonthlyOffToday: boolean,
  ): Promise<EmployeeTodayAttendanceStatus> {
    if (onLeaveToday && !todayRecord?.checkInAt) return 'leave';
    if (onMonthlyOffToday && !todayRecord?.checkInAt) return 'holiday';

    const absence = await this.prisma.absenceRecord.findFirst({
      where: { employeeId, companyId, workDate: today, deletedAt: null },
    });
    if (absence && !todayRecord?.checkInAt) return 'absent';
    if (todayRecord?.checkInAt && !todayRecord?.checkOutAt) return 'working';
    if (todayRecord?.checkOutAt) return 'checked_out';
    return 'not_checked_in';
  }

  private resolveHistoryStatus(
    row: { checkInAt: Date | null; checkOutAt: Date | null; lateMinutes: number; status: string },
    onLeave: boolean,
    onMonthlyOff: boolean,
    hasAbsence: boolean,
  ): EmployeeAttendanceHistoryStatus {
    // Status follows real attendance only. OT alone must never turn a day into "worked".
    if (onLeave && !row.checkInAt) return 'leave';
    if (onMonthlyOff && !row.checkInAt) return 'holiday';
    if (hasAbsence && !row.checkInAt) return 'absent';
    if (row.lateMinutes > 0 && row.checkInAt) return 'late';
    if (row.checkInAt && !row.checkOutAt) return 'working';
    if (row.checkOutAt) return 'checked_out';
    if (!row.checkInAt) return 'absent';
    return 'incomplete';
  }

  private isWeekendWorkDate(date: Date): boolean {
    const weekday = new Intl.DateTimeFormat('en-US', {
      timeZone: BANGKOK_TZ,
      weekday: 'short',
    }).format(date);
    return weekday === 'Sat' || weekday === 'Sun';
  }

  async adminUpdateRecord(
    actor: ActorContext,
    employeeId: string,
    recordId: string,
    dto: UpdateAttendanceRecordDto,
  ): Promise<UpdateAttendanceRecordResponse> {
    await this.assertCanAdminEditAttendance(actor, dto.companyId);
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);

    const record = await this.prisma.attendanceRecord.findFirst({
      where: { id: recordId, employeeId, companyId: dto.companyId, deletedAt: null },
    });
    if (!record) throw new AttendanceRecordNotFoundError(recordId);

    const recordUpdate: {
      checkInAt?: Date | null;
      checkOutAt?: Date | null;
      lateMinutes?: number;
      totalBreakMinutes?: number;
      workedMinutes?: number;
      workCategory?: string;
      status: 'corrected';
      source: 'correction';
      updatedBy: string;
    } = {
      status: 'corrected',
      source: 'correction',
      updatedBy: actor.userId,
    };

    if (dto.checkInAt !== undefined) {
      recordUpdate.checkInAt = dto.checkInAt ? new Date(dto.checkInAt) : null;
    }
    if (dto.checkOutAt !== undefined) {
      recordUpdate.checkOutAt = dto.checkOutAt ? new Date(dto.checkOutAt) : null;
    }
    if (dto.lateMinutes !== undefined) {
      recordUpdate.lateMinutes = dto.lateMinutes;
    }
    if (dto.breakMinutes !== undefined) {
      recordUpdate.totalBreakMinutes = dto.breakMinutes;
    }
    if (dto.workedHours !== undefined) {
      recordUpdate.workedMinutes = Math.round(dto.workedHours * 60);
    }
    if (dto.workCategory) {
      recordUpdate.workCategory = dto.workCategory === 'wfh' ? 'wfh' : 'office';
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.attendanceRecord.update({
        where: { id: recordId },
        data: recordUpdate,
      });

      if (dto.otHours !== undefined) {
        const effectiveCheckIn = dto.checkInAt !== undefined
          ? (dto.checkInAt ? new Date(dto.checkInAt) : null)
          : record.checkInAt;
        if (dto.otHours > 0 && !effectiveCheckIn) {
          throw new BadRequestException('ไม่สามารถเพิ่ม OT ในวันที่ไม่ได้เช็กอินเข้างาน');
        }

        const config = await this.attendanceSettings.getRules(dto.companyId);
        const amount = Math.round(dto.otHours * config.otHourlyRate * 100) / 100;
        const existing = await tx.overtimeRecord.findFirst({
          where: {
            employeeId,
            companyId: dto.companyId,
            workDate: record.workDate,
            deletedAt: null,
            status: 'approved',
          },
        });

        if (dto.otHours === 0 && existing) {
          await tx.overtimeRecord.update({
            where: { id: existing.id },
            data: {
              deletedAt: new Date(),
              deletedBy: actor.userId,
              status: 'rejected',
            },
          });
        } else if (dto.otHours > 0) {
          const otData = {
            otHours: dto.otHours,
            otMinutes: Math.round(dto.otHours * 60),
            amount,
            rateApplied: config.otHourlyRate,
            status: 'approved' as const,
            updatedBy: actor.userId,
          };
          if (existing) {
            await tx.overtimeRecord.update({ where: { id: existing.id }, data: otData });
          } else {
            await tx.overtimeRecord.create({
              data: {
                id: randomUUID(),
                employeeId,
                companyId: dto.companyId,
                attendanceRecordId: recordId,
                workDate: record.workDate,
                otStartAt: record.checkOutAt,
                otEndAt: record.checkOutAt,
                ...otData,
                createdBy: actor.userId,
              },
            });
          }
        }
      }

      if (dto.shift) {
        await tx.adminCommissionEmployeeProfile.updateMany({
          where: { employeeId, companyId: dto.companyId, deletedAt: null },
          data: { defaultShift: dto.shift, updatedBy: actor.userId },
        });
      }
    });

    await this.audit.record(actor, {
      entityType: 'AttendanceRecord',
      entityId: recordId,
      action: 'admin_update',
      after: { ...dto, recordId },
    });

    return { id: recordId };
  }

  async adminDeleteOvertime(
    actor: ActorContext,
    employeeId: string,
    overtimeId: string,
    companyId: string,
    reason: string,
  ): Promise<{ id: string; deleted: boolean }> {
    await this.assertCanAdminEditAttendance(actor, companyId);
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, companyId);
    if (!reason.trim()) throw new BadRequestException('กรุณาระบุเหตุผลการลบ');

    const ot = await this.prisma.overtimeRecord.findFirst({
      where: {
        id: overtimeId,
        employeeId,
        companyId,
        deletedAt: null,
      },
    });
    if (!ot) throw new BadRequestException('ไม่พบรายการ OT');

    if (ot.payrollItemId) {
      const item = await this.prisma.payrollItem.findFirst({
        where: { id: ot.payrollItemId, deletedAt: null },
        include: { payrollCycle: { select: { status: true } } },
      });
      if (item?.payrollCycle && item.payrollCycle.status !== 'open') {
        throw new BadRequestException('ไม่สามารถลบ OT ที่รวมในเงินเดือนที่ล็อคแล้ว');
      }
      if (item) {
        await this.prisma.payrollItem.update({
          where: { id: item.id },
          data: {
            deletedAt: new Date(),
            deletedBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      }
    }

    await this.prisma.overtimeRecord.update({
      where: { id: overtimeId },
      data: {
        status: 'rejected',
        payrollItemId: null,
        deletedAt: new Date(),
        deletedBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'OvertimeRecord',
      entityId: overtimeId,
      action: 'admin_delete',
      after: { employeeId, companyId, reason: reason.trim() },
    });

    return { id: overtimeId, deleted: true };
  }

  async cleanupInvalidOvertimeRecords(): Promise<number> {
    const rows = await this.prisma.overtimeRecord.findMany({
      where: { deletedAt: null, status: 'approved' },
      select: {
        id: true,
        employeeId: true,
        companyId: true,
        workDate: true,
        attendanceRecordId: true,
        payrollItemId: true,
      },
      take: 500,
    });

    let removed = 0;
    for (const ot of rows) {
      const attendance = ot.attendanceRecordId
        ? await this.prisma.attendanceRecord.findFirst({
          where: { id: ot.attendanceRecordId, deletedAt: null },
          select: { checkInAt: true },
        })
        : await this.prisma.attendanceRecord.findFirst({
          where: {
            employeeId: ot.employeeId,
            companyId: ot.companyId,
            workDate: ot.workDate,
            deletedAt: null,
          },
          select: { checkInAt: true },
        });

      if (attendance?.checkInAt) continue;

      if (ot.payrollItemId) {
        const item = await this.prisma.payrollItem.findFirst({
          where: { id: ot.payrollItemId, deletedAt: null },
          include: { payrollCycle: { select: { status: true } } },
        });
        if (item?.payrollCycle && item.payrollCycle.status !== 'open') {
          this.logger.warn(`Skip invalid OT ${ot.id} — locked payroll`);
          continue;
        }
        if (item) {
          await this.prisma.payrollItem.update({
            where: { id: item.id },
            data: { deletedAt: new Date() },
          });
        }
      }

      await this.prisma.overtimeRecord.update({
        where: { id: ot.id },
        data: {
          status: 'rejected',
          payrollItemId: null,
          deletedAt: new Date(),
        },
      });
      removed += 1;
      this.logger.warn(`Removed invalid OT ${ot.id} (no check-in on work day)`);
    }
    return removed;
  }

  private async assertCanAdminEditAttendance(actor: ActorContext, companyId: string): Promise<void> {
    const assignment = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId: actor.userId, isActive: true, deletedAt: null },
      select: { role: true },
    });
    const businessRole = assignment?.role ?? null;
    if (businessRole === 'secretary') return;
    if (businessRole === 'big_leader') {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
      return;
    }

    const hasWriteViaUserRole = await this.prisma.userRole.findFirst({
      where: {
        userId: actor.userId,
        deletedAt: null,
        role: {
          deletedAt: null,
          rolePermissions: { some: { permission: { key: 'attendance:write' } } },
        },
      },
      select: { id: true },
    });
    if (hasWriteViaUserRole) return;

    if (businessRole) {
      const hasWriteViaBusinessRole = await this.prisma.role.findFirst({
        where: {
          code: businessRole,
          deletedAt: null,
          rolePermissions: { some: { permission: { key: 'attendance:write' } } },
        },
        select: { id: true },
      });
      if (hasWriteViaBusinessRole) return;
    }

    throw new ForbiddenException('ไม่มีสิทธิ์แก้ไขเวลาทำงาน');
  }

  async listDaily(actor: ActorContext, companyId: string, workDate?: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const date = workDate ? new Date(workDate) : this.today();
    const rows = await this.prisma.attendanceRecord.findMany({
      where: { companyId, workDate: date, deletedAt: null },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, globalId: true } },
      },
      orderBy: { checkInAt: 'asc' },
    });
    const absenceRows = await this.prisma.absenceRecord.findMany({
      where: { companyId, workDate: date, deletedAt: null },
      select: { id: true, employeeId: true, status: true },
    });
    const absenceByEmployee = new Map(absenceRows.map((a) => [a.employeeId, a]));
    return rows.map((row) => {
      const absence = absenceByEmployee.get(row.employeeId);
      return {
        id: row.id,
        employeeId: row.employeeId,
        employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
        globalId: row.employee.globalId,
        workDate: row.workDate.toISOString().slice(0, 10),
        checkInAt: row.checkInAt?.toISOString() ?? null,
        checkOutAt: row.checkOutAt?.toISOString() ?? null,
        lateMinutes: row.lateMinutes,
        workedMinutes: row.workedMinutes,
        status: row.status,
        absenceRecordId: absence?.id ?? null,
        absenceStatus: absence?.status ?? null,
        mayBeAbsent: !row.checkInAt && !absence,
      };
    });
  }

  async listPendingOvertime(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.overtimeRecord.findMany({
      where: {
        companyId,
        status: 'pending',
        deletedAt: null,
      },
      include: {
        employee: { select: { firstName: true, lastName: true, globalId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      globalId: row.employee.globalId,
      workDate: row.workDate.toISOString().slice(0, 10),
      overtimeHours: Number(row.otHours),
      status: row.status,
      workflowInstanceId: row.workflowInstanceId,
    }));
  }

  private toResponse(r: AttendanceRecord, shiftName?: string): AttendanceResponse {
    const p = r.toPersistence();
    return {
      id: p.id,
      employeeId: p.employeeId,
      companyId: p.companyId,
      workDate: p.workDate.toISOString().slice(0, 10),
      workCategory: p.workCategory === 'wfh' ? 'wfh' : 'office',
      shiftId: p.shiftId,
      shiftName: shiftName ?? null,
      shiftStartAt: p.shiftStartAt ? p.shiftStartAt.toISOString() : null,
      shiftEndAt: p.shiftEndAt ? p.shiftEndAt.toISOString() : null,
      checkInAt: p.checkInAt ? p.checkInAt.toISOString() : null,
      checkOutAt: p.checkOutAt ? p.checkOutAt.toISOString() : null,
      lateMinutes: p.lateMinutes,
      roundedLateHours: p.roundedLateHours,
      lateDeduction: p.lateDeduction,
      workedMinutes: p.workedMinutes,
      status: p.status,
    };
  }
}
