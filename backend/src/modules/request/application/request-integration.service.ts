import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
  OnModuleInit,
  Optional,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext, SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  combineBangkokWorkDateAndTime,
  normalizeThaiTimeInput,
  parseThaiTimeInput,
  repairUtcHoursStoredAsBangkok,
} from '../../../shared/time/thai-time-input.util';
import {
  bangkokTimeKey,
  mapCorrectionTypeToField,
  parseWorkDateIso,
  type CorrectionField,
} from '../../../shared/time/time-correction-field.util';
import { AttendanceService } from '../../attendance/application/attendance.service';
import { AbsenceAutoWaiveService } from '../../attendance/application/absence-auto-waive.service';
import { ShiftAssignmentService } from '../../attendance/application/shift-assignment.service';
import { DocumentRequestService } from '../../document-request/application/document-request.service';
import { DailyAttendanceLedgerService } from '../../attendance/application/daily-attendance-ledger.service';
import { MonthlyOffService } from '../../attendance/application/monthly-off.service';
import { halfYearPeriodContaining } from '../../leave/domain/services/emergency-leave-entitlement.service';
import {
  computeInclusiveLeaveDays,
} from '../../leave/domain/services/leave-reschedule-policy.service';
import {
  isEmergencyLeaveType,
  isOffDayLeaveType,
} from '../../leave/domain/services/leave-type-classification';
import { AttendanceSettingsService } from '../../settings/application/attendance-settings.service';
import { DEFAULT_ATTENDANCE_RULES } from '../../settings/domain/attendance-settings.types';
import { TelegramRegistrationIntegrationService } from '../../security/application/telegram-registration-integration.service';
import { valuesMapFromRows } from './request-condition.util';
import { RequestAttendanceGuardService } from './request-attendance-guard.service';
import {
  EmployeeDayConflictService,
  expandIsoDateRange,
} from '../../leave/application/employee-day-conflict.service';

const LEAVE_FORM_TO_TYPE_CODE: Record<string, string> = {
  sick: 'sick',
  personal: 'annual',
  emergency: 'emergency',
  unpaid: 'unpaid',
};

const DEFAULT_OT_HOURLY_RATE = 50;

export type { CorrectionField } from '../../../shared/time/time-correction-field.util';
export { mapCorrectionTypeToField } from '../../../shared/time/time-correction-field.util';

interface IntegrationResult {
  entityType: string;
  entityId: string | null;
  message: string;
  skipDomainWrite?: boolean;
}

interface IntegrationWriteResult {
  status: 'completed' | 'failed' | 'skipped';
  entityType: string;
  entityId: string | null;
  message: string;
  error?: string;
}

/** Request types with no downstream domain write — integration is intentionally skipped. */
const NO_INTEGRATION_TYPE_KEYS = new Set(['generic_request']);

/** Approved requests that still need domain integration (failed, pending, or never run). */
const INCOMPLETE_INTEGRATION_FILTER: Prisma.RequestInstanceWhereInput = {
  OR: [
    { integrationStatus: null },
    { integrationStatus: 'failed' },
    { integrationStatus: 'pending' },
    { integrationStatus: 'completed', integrationEntityId: null },
  ],
};

interface LeaveConsumptionInput {
  employeeId: string;
  leaveTypeId: string;
  periodStart: Date;
  days: number;
  borrowed: boolean;
  actorUserId: string;
}

type ValuesMap = Record<string, unknown>;

export function computeOtHoursFromTimes(startTime: string, endTime: string): number {
  const start = parseTimeParts(startTime);
  const end = parseTimeParts(endTime);
  if (!start || !end) return 1;

  let minutes = (end.hours * 60 + end.minutes) - (start.hours * 60 + start.minutes);
  if (minutes <= 0) {
    if (start.hours === end.hours && start.minutes === end.minutes) return 1;
    minutes += 24 * 60;
  }
  return Math.max(1, Math.floor(minutes / 60));
}

function parseTimeParts(value: string): { hours: number; minutes: number } | null {
  return parseThaiTimeInput(String(value).trim());
}

function parseDate(value: unknown): Date {
  return new Date(String(value));
}

function parseString(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  return String(value);
}

function periodStartOf(date: Date): Date {
  const d = new Date(date);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 25));
  if (d.getUTCDate() < 25) start.setUTCMonth(start.getUTCMonth() - 1);
  return start;
}

function computeLeaveDaysFromValues(values: ValuesMap): number {
  const durationType = parseString(values.durationType);
  if (durationType === 'am' || durationType === 'pm') return 0.5;

  const leaveDates = parseLeaveDatesValue(values.leaveDates);
  if (leaveDates.length > 1) return leaveDates.length;

  const start = parseDate(values.startDate);
  const end = parseDate(values.endDate ?? values.startDate);
  return computeInclusiveLeaveDays(start, end);
}

function parseLeaveDatesValue(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return raw.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
  }
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map(String).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d));
      }
    } catch {
      return [];
    }
  }
  return [];
}

@Injectable()
export class RequestIntegrationService implements OnModuleInit {
  private readonly logger = new Logger(RequestIntegrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
    private readonly attendanceGuard: RequestAttendanceGuardService,
    @Optional()
    @Inject(forwardRef(() => TelegramRegistrationIntegrationService))
    private readonly telegramRegistration?: TelegramRegistrationIntegrationService,
    @Optional() private readonly attendanceSettings?: AttendanceSettingsService,
    @Optional() private readonly monthlyOff?: MonthlyOffService,
    @Optional() private readonly attendanceLedger?: DailyAttendanceLedgerService,
    @Optional() private readonly dayConflicts?: EmployeeDayConflictService,
    @Optional()
    @Inject(forwardRef(() => AttendanceService))
    private readonly attendance?: AttendanceService,
    @Optional() private readonly absenceAutoWaive?: AbsenceAutoWaiveService,
    @Optional() private readonly shiftAssignments?: ShiftAssignmentService,
    @Optional() private readonly documentRequests?: DocumentRequestService,
  ) {}

  onModuleInit(): void {
    void this.reconcileIncompleteIntegrations().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed reconciling incomplete request integrations: ${message}`);
    });
    void this.reconcileApprovedTimeCorrections().catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`Failed reconciling approved time corrections: ${message}`);
    });
  }

  /** Re-apply integration for approved time corrections that failed or used legacy UTC timestamps. */
  async reconcileApprovedTimeCorrections(): Promise<void> {
    if (!this.attendance) return;
    const platformSynced = await this.attendance.syncApprovedPlatformTimeCorrections();
    if (platformSynced > 0) {
      this.logger.log(`Synced ${platformSynced} approved platform time correction(s) on startup`);
    }
    const fixed = await this.attendance.repairMiszonedCorrectionTimestamps();
    if (fixed > 0) {
      this.logger.log(`Repaired ${fixed} miszoned time-correction timestamp(s) on startup`);
    }
    const zeroSynced = await this.attendance.syncZeroWorkedMinutesRecords();
    if (zeroSynced > 0) {
      this.logger.log(`Recalculated worked minutes for ${zeroSynced} attendance record(s) on startup`);
    }
  }

  async processApprovedRequest(actor: ActorContext, requestInstanceId: string): Promise<void> {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: requestInstanceId, deletedAt: null },
      include: {
        requestType: true,
        values: true,
        approvalSteps: true,
      },
    });
    if (!instance) return;
    if (instance.status !== 'approved') return;

    const pendingSteps = instance.approvalSteps.filter((s) => s.status === 'pending');
    if (pendingSteps.length > 0) return;

    // Already integrated — do not re-run (re-run used to mark OT as failed after success).
    if (instance.requestType.key === 'off_day_change') {
      const alreadySwapped = await this.hasOffDayChangeApplied(requestInstanceId);
      if (instance.integrationStatus === 'completed' && alreadySwapped) return;
    } else if (instance.integrationStatus === 'completed' && instance.integrationEntityId) {
      if (instance.requestType.key === 'time_correction') {
        const values = valuesMapFromRows(instance.values);
        const drift = await this.hasTimeCorrectionDrift(instance, values);
        if (!drift) return;
        this.logger.warn(`Re-applying time correction for request ${requestInstanceId} — attendance drift detected`);
      } else {
        return;
      }
    }

    await this.prisma.requestInstance.update({
      where: { id: requestInstanceId },
      data: { integrationStatus: 'pending' },
    });

    const typeKey = instance.requestType.key;
    const values = valuesMapFromRows(instance.values);

    try {
      const result = await this.integrateByTypeKey(actor, instance, typeKey, values);
      await this.markIntegrationResult(actor, requestInstanceId, {
        status: result.skipDomainWrite ? 'skipped' : 'completed',
        entityType: result.entityType,
        entityId: result.entityId,
        message: result.message,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Integration failed';
      this.logger.error(`Request integration failed for ${requestInstanceId}`, message);
      await this.markIntegrationResult(actor, requestInstanceId, {
        status: 'failed',
        entityType: typeKey,
        entityId: null,
        message,
        error: message,
      });
    }
  }

  /** Manual retry for approved requests whose domain integration failed or stalled. */
  async forceRetryIntegration(actor: ActorContext, requestInstanceId: string): Promise<void> {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: requestInstanceId, deletedAt: null },
      include: { requestType: true },
    });
    if (!instance) throw new Error('Request not found');
    if (instance.status !== 'approved') {
      throw new Error('Only approved requests can retry integration');
    }
    if (NO_INTEGRATION_TYPE_KEYS.has(instance.requestType.key)) {
      throw new Error('This request type has no domain integration');
    }

    if (
      instance.requestType.key === 'time_correction'
      && instance.integrationStatus === 'completed'
      && instance.integrationEntityId
    ) {
      await this.reconcileApprovedTimeCorrections();
      return;
    }
    if (instance.integrationStatus === 'completed' && instance.integrationEntityId) {
      throw new Error('Integration already completed');
    }

    await this.prisma.requestInstance.update({
      where: { id: requestInstanceId },
      data: {
        integrationStatus: null,
        integrationEntityType: null,
        integrationEntityId: null,
        integrationError: null,
      },
    });
    await this.processApprovedRequest(actor, requestInstanceId);
  }

  private async integrateByTypeKey(
    actor: ActorContext,
    instance: Awaited<ReturnType<PrismaService['requestInstance']['findFirst']>> & { id: string; requestType: { key: string } },
    typeKey: string,
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    switch (typeKey) {
      case 'leave_request':
        return this.integrateLeaveRequest(actor, instance, values);
      case 'ot_request':
        return this.integrateOtRequest(actor, instance, values);
      case 'no_break_report':
        return this.integrateNoBreakReport(actor, instance, values);
      case 'advance_pay':
        return this.integrateAdvancePay(actor, instance, values);
      case 'time_correction':
        return this.integrateTimeCorrection(actor, instance, values);
      case 'shift_change':
        return this.integrateShiftChange(actor, instance, values);
      case 'off_day_change':
        return this.integrateOffDayChange(actor, instance, values);
      case 'document_request':
        return this.integrateDocumentRequest(actor, instance, values);
      case 'telegram_registration_review':
      case 'employee_onboarding':
        return this.integrateTelegramRegistrationReview(actor, instance, values);
      default:
        if (NO_INTEGRATION_TYPE_KEYS.has(typeKey)) {
          return {
            entityType: 'RequestInstance',
            entityId: null,
            message: `No domain integration required for ${typeKey}`,
            skipDomainWrite: true,
          };
        }
        throw new Error(`Unsupported request type for integration: ${typeKey}`);
    }
  }

  async stageLeaveOnSubmit(
    actor: ActorContext,
    requestInstanceId: string,
    values: ValuesMap,
  ): Promise<void> {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: requestInstanceId, deletedAt: null },
      include: { requestType: true },
    });
    if (!instance || instance.requestType.key !== 'leave_request') return;

    const formLeaveType = parseString(values.leaveType);
    if (formLeaveType === 'monthly_off') return;

    const leaveTypeCode = LEAVE_FORM_TO_TYPE_CODE[formLeaveType] ?? formLeaveType;
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { code: leaveTypeCode, deletedAt: null },
    });
    if (!leaveType) return;

    const startDate = parseDate(values.startDate);
    const endDate = parseDate(values.endDate ?? values.startDate);
    const days = computeLeaveDaysFromValues(values);
    const leaveDates = parseLeaveDatesValue(values.leaveDates);
    const conflictDates = leaveDates.length
      ? leaveDates
      : expandIsoDateRange(
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
      );
    if (this.dayConflicts) {
      await this.dayConflicts.assertNoConflict({
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        dates: conflictDates,
      });
    }
    const stagedEntityId = randomUUID();

    await this.prisma.leaveRequest.create({
      data: {
        id: stagedEntityId,
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        days: new Prisma.Decimal(days),
        reason: parseString(values.reason) || null,
        status: 'pending',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    const stagedEntityType = 'LeaveRequest';
    await this.prisma.requestTimelineEvent.create({
      data: {
        requestInstanceId,
        eventType: 'integration_action_executed',
        actorUserId: actor.userId,
        message: 'บันทึกลาในปฏิทิมทีม (รออนุมัติ)',
        payloadJson: { stagedEntityType, stagedEntityId, action: 'staged' },
      },
    });
  }

  async stageTimeCorrectionOnSubmit(
    _actor: ActorContext,
    requestInstanceId: string,
    values: ValuesMap,
  ): Promise<void> {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: requestInstanceId, deletedAt: null },
      include: { requestType: true },
    });
    if (!instance || instance.requestType.key !== 'time_correction') return;
    await this.syncAbsenceAfterTimeCorrectionRequest(instance, values);
  }

  async rejectStagedLeave(requestInstanceId: string, actorUserId: string): Promise<void> {
    const staged = await this.findStagedEntity(requestInstanceId);
    if (!staged) return;

    if (staged.entityType === 'MonthlyOffRequest') {
      await this.prisma.monthlyOffRequest.updateMany({
        where: { id: staged.entityId, status: 'pending' },
        data: { status: 'rejected', updatedBy: actorUserId },
      });
    } else if (staged.entityType === 'LeaveRequest') {
      await this.prisma.leaveRequest.updateMany({
        where: { id: staged.entityId, status: 'pending' },
        data: { status: 'rejected', updatedBy: actorUserId },
      });
    }
  }

  private async findStagedEntity(
    requestInstanceId: string,
  ): Promise<{ entityType: string; entityId: string } | null> {
    const event = await this.prisma.requestTimelineEvent.findFirst({
      where: {
        requestInstanceId,
        eventType: 'integration_action_executed',
        message: 'บันทึกลาในปฏิทิมทีม (รออนุมัติ)',
      },
      orderBy: { createdAt: 'desc' },
    });
    const payload = event?.payloadJson as Record<string, unknown> | null | undefined;
    const stagedEntityId = payload?.stagedEntityId;
    const stagedEntityType = payload?.stagedEntityType;
    if (!stagedEntityId || !stagedEntityType) return null;
    return { entityType: String(stagedEntityType), entityId: String(stagedEntityId) };
  }

  private async integrateLeaveRequest(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const staged = await this.findStagedEntity(instance.id);
    const formLeaveType = parseString(values.leaveType);

    if (staged?.entityType === 'MonthlyOffRequest' && formLeaveType === 'monthly_off') {
      const monthlyOffRow = await this.prisma.monthlyOffRequest.findFirst({
        where: { id: staged.entityId, deletedAt: null },
      });
      await this.prisma.monthlyOffRequest.update({
        where: { id: staged.entityId },
        data: {
          status: 'approved',
          approvedById: actor.userId,
          approvedAt: this.dates.now(),
          updatedBy: actor.userId,
        },
      });
      if (monthlyOffRow && this.monthlyOff) {
        await this.monthlyOff.syncApprovedOffDays(
          monthlyOffRow.employeeId,
          monthlyOffRow.companyId,
          monthlyOffRow.selectedDates,
        );
      }
      await this.audit.record(actor, {
        entityType: 'MonthlyOffRequest',
        entityId: staged.entityId,
        action: 'integrated_from_request',
        after: { requestInstanceId: instance.id },
      });
      return {
        entityType: 'MonthlyOffRequest',
        entityId: staged.entityId,
        message: 'Approved monthly off from leave request',
      };
    }

    if (staged?.entityType === 'LeaveRequest') {
      const leave = await this.prisma.leaveRequest.findFirst({
        where: { id: staged.entityId, deletedAt: null },
        include: { leaveType: true },
      });
      if (!leave) throw new Error('Staged leave not found');

      await this.prisma.leaveRequest.update({
        where: { id: leave.id },
        data: { status: 'approved', updatedBy: actor.userId },
      });

      const periodStart = isEmergencyLeaveType(leave.leaveType.code)
        ? halfYearPeriodContaining(leave.startDate).periodStart
        : periodStartOf(leave.startDate);

      await this.applyLeaveConsumption({
        employeeId: leave.employeeId,
        leaveTypeId: leave.leaveTypeId,
        periodStart,
        days: Number(leave.days),
        borrowed: false,
        actorUserId: actor.userId,
      });

      await this.audit.record(actor, {
        entityType: 'LeaveRequest',
        entityId: leave.id,
        action: 'integrated_from_request',
        after: { requestInstanceId: instance.id, days: Number(leave.days) },
      });

      return {
        entityType: 'LeaveRequest',
        entityId: leave.id,
        message: `Approved leave request (${leave.days} days)`,
      };
    }

    return this.integrateLeaveRequestLegacy(actor, instance, values);
  }

  private async integrateLeaveRequestLegacy(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const formLeaveType = parseString(values.leaveType);
    if (formLeaveType === 'monthly_off') {
      throw new Error('วันหยุดประจำเดือนไม่ใช่การลา — ใช้เมนูแจ้งวันหยุดแทน');
    }

    const leaveTypeCode = LEAVE_FORM_TO_TYPE_CODE[formLeaveType] ?? formLeaveType;
    const leaveType = await this.prisma.leaveType.findFirst({
      where: { code: leaveTypeCode, deletedAt: null },
    });
    if (!leaveType) throw new Error(`Leave type not found: ${leaveTypeCode}`);

    const startDate = parseDate(values.startDate);
    const endDate = parseDate(values.endDate ?? values.startDate);
    const days = computeLeaveDaysFromValues(values);
    const leaveDates = parseLeaveDatesValue(values.leaveDates);
    const conflictDates = leaveDates.length
      ? leaveDates
      : expandIsoDateRange(
        startDate.toISOString().slice(0, 10),
        endDate.toISOString().slice(0, 10),
      );
    if (this.dayConflicts) {
      await this.dayConflicts.assertNoConflict({
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        dates: conflictDates,
      });
    }
    const leaveId = randomUUID();

    await this.prisma.leaveRequest.create({
      data: {
        id: leaveId,
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        leaveTypeId: leaveType.id,
        startDate,
        endDate,
        days: new Prisma.Decimal(days),
        reason: parseString(values.reason) || null,
        status: 'approved',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    const periodStart = isEmergencyLeaveType(leaveType.code)
      ? halfYearPeriodContaining(startDate).periodStart
      : periodStartOf(startDate);

    await this.applyLeaveConsumption({
      employeeId: instance.requesterEmployeeId,
      leaveTypeId: leaveType.id,
      periodStart,
      days,
      borrowed: false,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'LeaveRequest',
      entityId: leaveId,
      action: 'integrated_from_request',
      after: { requestInstanceId: instance.id, days, leaveTypeCode },
    });

    return {
      entityType: 'LeaveRequest',
      entityId: leaveId,
      message: `Created approved leave request (${days} days)`,
    };
  }

  private async applyLeaveConsumption(input: LeaveConsumptionInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const bal = await tx.leaveBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          periodStart: input.periodStart,
          deletedAt: null,
        },
      });

      if (!bal) {
        await tx.leaveBalance.create({
          data: {
            id: randomUUID(),
            employeeId: input.employeeId,
            leaveTypeId: input.leaveTypeId,
            periodStart: input.periodStart,
            periodEnd: input.periodStart,
            entitled: new Prisma.Decimal(0),
            used: new Prisma.Decimal(input.days),
            borrowed: new Prisma.Decimal(input.borrowed ? input.days : 0),
            remaining: new Prisma.Decimal(-input.days),
            createdBy: input.actorUserId,
            updatedBy: input.actorUserId,
          },
        });
        return;
      }

      const used = Number(bal.used) + input.days;
      const borrowed = Number(bal.borrowed) + (input.borrowed ? input.days : 0);
      const remaining = Number(bal.entitled) - used;

      await tx.leaveBalance.update({
        where: { id: bal.id },
        data: {
          used: new Prisma.Decimal(used),
          borrowed: new Prisma.Decimal(borrowed),
          remaining: new Prisma.Decimal(remaining),
          updatedBy: input.actorUserId,
        },
      });
    });
  }

  private async restoreLeaveConsumption(input: LeaveConsumptionInput): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const bal = await tx.leaveBalance.findFirst({
        where: {
          employeeId: input.employeeId,
          leaveTypeId: input.leaveTypeId,
          periodStart: input.periodStart,
          deletedAt: null,
        },
      });
      if (!bal) return;

      const used = Math.max(0, Number(bal.used) - input.days);
      const borrowed = Math.max(0, Number(bal.borrowed) - (input.borrowed ? input.days : 0));
      const remaining = Number(bal.entitled) - used;

      await tx.leaveBalance.update({
        where: { id: bal.id },
        data: {
          used: new Prisma.Decimal(used),
          borrowed: new Prisma.Decimal(borrowed),
          remaining: new Prisma.Decimal(remaining),
          updatedBy: input.actorUserId,
        },
      });
    });
  }

  private async integrateOtRequest(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const workDate = parseDate(values.otDate);

    // OT is only valid on a real worked day (check-in) and outside shift hours.
    const snapshot = await this.attendanceGuard.assertAttendanceLinkedRequest(
      'ot_request',
      instance.requesterEmployeeId,
      instance.companyId,
      values,
      instance.id,
    );

    const existing = await this.prisma.overtimeRecord.findFirst({
      where: {
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        workDate,
        deletedAt: null,
        status: { in: ['pending', 'approved'] },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      if (existing.status !== 'approved') {
        await this.prisma.overtimeRecord.update({
          where: { id: existing.id },
          data: {
            status: 'approved',
            attendanceRecordId: existing.attendanceRecordId ?? snapshot.recordId,
            updatedBy: actor.userId,
          },
        });
      }
      return {
        entityType: 'OvertimeRecord',
        entityId: existing.id,
        message: `OT record already exists (${Number(existing.otHours)}h)`,
      };
    }

    const startTime = normalizeThaiTimeInput(parseString(values.startTime)) ?? parseString(values.startTime);
    const endTime = normalizeThaiTimeInput(parseString(values.endTime)) ?? parseString(values.endTime);
    const otHours = computeOtHoursFromTimes(startTime, endTime);
    const rateApplied = DEFAULT_OT_HOURLY_RATE;
    const amount = Math.round(otHours * rateApplied * 100) / 100;

    const reasonLabels: Record<string, string> = {
      urgent_work: 'งานเร่งด่วน',
      continued_work: 'งานค้างต่อเนื่อง',
      client_meeting: 'ลูกค้า/นัดหมาย',
      other: 'อื่นๆ',
    };
    const reasonKey = parseString(values.reason);
    const reasonDetail = parseString(values.reasonDetail);
    const reason = reasonKey === 'other'
      ? (reasonDetail || reasonLabels.other)
      : (reasonLabels[reasonKey] ?? reasonKey);

    const otId = randomUUID();
    const workDateIso = workDate.toISOString().slice(0, 10);
    const otStartAt = startTime
      ? combineBangkokWorkDateAndTime(workDateIso, startTime)
      : null;
    const otEndAt = endTime
      ? combineBangkokWorkDateAndTime(workDateIso, endTime)
      : null;

    await this.prisma.overtimeRecord.create({
      data: {
        id: otId,
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        attendanceRecordId: snapshot.recordId,
        workDate,
        otStartAt,
        otEndAt,
        otHours: new Prisma.Decimal(otHours),
        otMinutes: Math.round(otHours * 60),
        rateApplied: new Prisma.Decimal(rateApplied),
        amount: new Prisma.Decimal(amount),
        reason: reason || null,
        status: 'approved',
        approvedAt: this.dates.now(),
        approvedById: actor.userId !== SYSTEM_ACTOR.userId ? actor.userId : null,
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'OvertimeRecord',
      entityId: otId,
      action: 'integrated_from_request',
      after: { requestInstanceId: instance.id, otHours, amount },
    });

    await this.attendance?.linkApprovedOtToOpenPayroll(otId);

    return {
      entityType: 'OvertimeRecord',
      entityId: otId,
      message: `Created approved OT record (${otHours}h)`,
    };
  }

  private async integrateNoBreakReport(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const workDate = parseDate(values.workDate);
    const snapshot = await this.attendanceGuard.assertAttendanceLinkedRequest(
      'no_break_report',
      instance.requesterEmployeeId,
      instance.companyId,
      values,
      instance.id,
    );
    const note = parseString(values.note).trim();
    const breakMinutes = await this.resolveBreakMinutes(instance.companyId);
    const otMinutes = breakMinutes;
    const otHours = Math.max(1, Math.ceil(breakMinutes / 60));
    const rateApplied = DEFAULT_OT_HOURLY_RATE;
    const amount = Math.round(otHours * rateApplied * 100) / 100;
    const reason = note ? `ไม่ได้พักเบรก — ${note}` : 'ไม่ได้พักเบรก';

    const existing = await this.prisma.overtimeRecord.findFirst({
      where: {
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        workDate,
        deletedAt: null,
        status: { in: ['pending', 'approved'] },
        reason: { contains: 'ไม่ได้พักเบรก' },
      },
      orderBy: { createdAt: 'asc' },
    });
    if (existing) {
      if (existing.status !== 'approved') {
        await this.prisma.overtimeRecord.update({
          where: { id: existing.id },
          data: {
            status: 'approved',
            attendanceRecordId: existing.attendanceRecordId ?? snapshot.recordId,
            updatedBy: actor.userId,
          },
        });
      }
      await this.attendance?.linkApprovedOtToOpenPayroll(existing.id);
      return {
        entityType: 'OvertimeRecord',
        entityId: existing.id,
        message: `No-break OT record already exists (${Number(existing.otHours)}h)`,
      };
    }

    const otId = randomUUID();

    await this.prisma.overtimeRecord.create({
      data: {
        id: otId,
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        attendanceRecordId: snapshot.recordId,
        workDate,
        otMinutes,
        otHours: new Prisma.Decimal(otHours),
        rateApplied: new Prisma.Decimal(rateApplied),
        amount: new Prisma.Decimal(amount),
        reason,
        status: 'approved',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'OvertimeRecord',
      entityId: otId,
      action: 'integrated_from_no_break_report',
      after: { requestInstanceId: instance.id, otHours, otMinutes, amount },
    });

    await this.attendance?.linkApprovedOtToOpenPayroll(otId);

    return {
      entityType: 'OvertimeRecord',
      entityId: otId,
      message: `Created approved no-break OT (${otHours}h from ${breakMinutes} min break)`,
    };
  }

  private async resolveBreakMinutes(companyId: string): Promise<number> {
    if (this.attendanceSettings) {
      const rules = await this.attendanceSettings.getRules(companyId);
      return rules.breakMinutes;
    }
    return DEFAULT_ATTENDANCE_RULES.breakMinutes;
  }

  private async integrateAdvancePay(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const amount = Number(values.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('Invalid advance amount');

    const advanceId = randomUUID();
    await this.prisma.advanceRequest.create({
      data: {
        id: advanceId,
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        amount: new Prisma.Decimal(amount),
        reason: parseString(values.reason) || null,
        status: 'approved',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'AdvanceRequest',
      entityId: advanceId,
      action: 'integrated_from_request',
      after: { requestInstanceId: instance.id, amount },
    });

    return {
      entityType: 'AdvanceRequest',
      entityId: advanceId,
      message: `Created approved advance request (฿${amount})`,
    };
  }

  private async hasTimeCorrectionDrift(
    instance: { requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<boolean> {
    const workDateIso = parseWorkDateIso(values.attendanceDate);
    const correctionType = parseString(values.correctionType);
    const requestedTime = normalizeThaiTimeInput(parseString(values.requestedTime))
      ?? parseString(values.requestedTime);
    if (!workDateIso || !correctionType || !requestedTime) return false;

    const field = mapCorrectionTypeToField(correctionType);
    if (field !== 'checkInAt' && field !== 'checkOutAt') return false;

    const correctedAt = combineBangkokWorkDateAndTime(workDateIso, requestedTime);
    if (!correctedAt) return false;

    const record = await this.prisma.attendanceRecord.findFirst({
      where: {
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        workDate: new Date(`${workDateIso}T00:00:00.000Z`),
        deletedAt: null,
      },
      select: { checkInAt: true, checkOutAt: true },
    });
    if (!record) return true;

    const current = field === 'checkInAt' ? record.checkInAt : record.checkOutAt;
    if (!current) return true;
    if (Math.abs(current.getTime() - correctedAt.getTime()) < 60_000) return false;

    const expectedKey = bangkokTimeKey(correctedAt);
    const currentKey = bangkokTimeKey(current);
    return expectedKey !== currentKey;
  }

  private async integrateTimeCorrection(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; requesterUserId?: string | null; companyId: string; integrationEntityId?: string | null },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const workDateIso = parseWorkDateIso(values.attendanceDate);
    if (!workDateIso) throw new Error('Invalid attendance date on time correction request');
    const workDate = new Date(`${workDateIso}T00:00:00.000Z`);
    const field = mapCorrectionTypeToField(parseString(values.correctionType));
    const timeStr = normalizeThaiTimeInput(parseString(values.requestedTime))
      ?? parseString(values.requestedTime);
    if (!timeStr) throw new Error('Missing requested time on time correction request');
    const correctedAt = combineDateAndTime(workDate, timeStr);

    let record = await this.prisma.attendanceRecord.findFirst({
      where: {
        employeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        workDate,
        deletedAt: null,
      },
      include: {
        breaks: { where: { breakEndAt: null }, orderBy: { breakStartAt: 'desc' }, take: 1 },
      },
    });

    if (!record && field === 'checkInAt') {
      const recordId = randomUUID();
      await this.prisma.attendanceRecord.create({
        data: {
          id: recordId,
          employeeId: instance.requesterEmployeeId,
          companyId: instance.companyId,
          workDate,
          status: 'incomplete',
          source: 'telegram',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
      record = await this.prisma.attendanceRecord.findFirst({
        where: { id: recordId },
        include: { breaks: true },
      });
    }
    if (!record) throw new Error('Attendance record not found for correction');

    const oldValue = field === 'checkInAt'
      ? record.checkInAt?.toISOString() ?? null
      : field === 'checkOutAt'
        ? record.checkOutAt?.toISOString() ?? null
        : null;

    let correctionId = instance.integrationEntityId ?? null;
    const existingCorrection = correctionId
      ? await this.prisma.attendanceCorrection.findFirst({
        where: { id: correctionId, deletedAt: null },
      })
      : null;

    if (existingCorrection) {
      correctionId = existingCorrection.id;
      await this.prisma.attendanceCorrection.update({
        where: { id: correctionId },
        data: {
          newValue: { value: correctedAt.toISOString() },
          status: 'approved',
          updatedBy: actor.userId,
        },
      });
    } else {
      correctionId = randomUUID();
      await this.prisma.attendanceCorrection.create({
        data: {
          id: correctionId,
          attendanceRecordId: record.id,
          requestedBy: instance.requesterUserId ?? actor.userId,
          field,
          oldValue: { value: oldValue },
          newValue: { value: correctedAt.toISOString() },
          reason: parseString(values.reason) || null,
          status: 'approved',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    }

    await this.applyCorrectionToRecord(record.id, field, correctedAt, actor.userId);
    if (field === 'checkInAt' || field === 'checkOutAt') {
      await this.attendance?.syncWorkedMinutesAfterCorrection(record.id);
    }
    await this.syncAbsenceAfterTimeCorrectionRequest(instance, values);
    await this.audit.record(actor, {
      entityType: 'AttendanceCorrection',
      entityId: correctionId,
      action: 'integrated_from_request',
      after: { requestInstanceId: instance.id, field, correctedAt: correctedAt.toISOString() },
    });

    return {
      entityType: 'AttendanceCorrection',
      entityId: correctionId,
      message: `Applied attendance correction (${field})`,
    };
  }

  private async applyCorrectionToRecord(
    attendanceRecordId: string,
    field: CorrectionField,
    correctedAt: Date,
    actorUserId: string,
  ): Promise<void> {
    if (field === 'checkInAt' || field === 'checkOutAt') {
      await this.prisma.attendanceRecord.update({
        where: { id: attendanceRecordId },
        data: {
          [field]: correctedAt,
          status: 'corrected',
          updatedBy: actorUserId,
        },
      });
      return;
    }

    if (field === 'breakStartAt') {
      const open = await this.prisma.breakRecord.findFirst({
        where: { attendanceRecordId, breakEndAt: null },
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
            attendanceRecordId,
            breakStartAt: correctedAt,
          },
        });
      }
      return;
    }

    if (field === 'breakEndAt') {
      const open = await this.prisma.breakRecord.findFirst({
        where: { attendanceRecordId, breakEndAt: null },
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

  private async integrateShiftChange(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const requestedShift = parseString(values.requestedShift);
    const effectiveDate = parseString(values.effectiveDate) || this.dates.todayString();
    const reason = parseString(values.reason) || 'shift_change request approved';

    if (!this.shiftAssignments) {
      throw new Error('Shift assignment service unavailable');
    }

    const shiftType: 'day' | 'night' = requestedShift === 'night' ? 'night' : 'day';
    await this.shiftAssignments.syncEmployeeProfileShift(
      actor,
      instance.requesterEmployeeId,
      instance.companyId,
      shiftType,
      effectiveDate.slice(0, 10),
    );

    await this.audit.record(actor, {
      entityType: 'RequestInstance',
      entityId: instance.id,
      action: 'shift_change_integrated',
      after: {
        requestedShift,
        effectiveDate,
        shiftType,
        reason,
      },
    });

    return {
      entityType: 'EmployeeShiftAssignment',
      entityId: instance.requesterEmployeeId,
      message: `Shift updated to ${shiftType} effective ${effectiveDate.slice(0, 10)}`,
    };
  }

  private async integrateOffDayChange(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    const current = this.parseOffDayIso(values.currentOffDay, 'currentOffDay');
    const requested = this.parseOffDayIso(values.requestedOffDay, 'requestedOffDay');

    let monthlyOffError: Error | null = null;
    if (this.monthlyOff) {
      try {
        const swap = await this.monthlyOff.swapMonthlyOffDay(
          instance.requesterEmployeeId,
          instance.companyId,
          current,
          requested,
          actor.userId,
        );
        return {
          entityType: 'MonthlyOffRequest',
          entityId: swap.monthlyOffRequestId,
          message:
            `เปลี่ยนวันหยุดแล้ว: ยกเลิก ${swap.previousDate} และตั้งวันหยุดใหม่ ${swap.nextDate}`,
        };
      } catch (error: unknown) {
        monthlyOffError = error instanceof Error ? error : new Error(String(error));
        this.logger.warn(`Monthly off swap failed for request ${instance.id}: ${monthlyOffError.message}`);
      }
    }

    const fallback = await this.swapApprovedLeaveOffDay(
      actor,
      instance.requesterEmployeeId,
      instance.companyId,
      current,
      requested,
    );
    if (fallback) return fallback;

    if (monthlyOffError) {
      throw new Error(`ไม่สามารถเปลี่ยนวันหยุดได้: ${monthlyOffError.message}`);
    }
    throw new Error('ไม่พบข้อมูลวันหยุดที่สามารถสลับได้');
  }

  private parseOffDayIso(value: unknown, fieldName: string): string {
    const iso = parseString(value);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) {
      throw new Error(`Invalid ${fieldName} format, expected YYYY-MM-DD`);
    }
    return iso;
  }

  private async swapApprovedLeaveOffDay(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
    currentOffDay: string,
    requestedOffDay: string,
  ): Promise<IntegrationResult | null> {
    const currentDate = new Date(`${currentOffDay}T00:00:00.000Z`);
    const requestedDate = new Date(`${requestedOffDay}T00:00:00.000Z`);

    const approvedLeave = await this.prisma.leaveRequest.findFirst({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
        startDate: currentDate,
        endDate: currentDate,
      },
      include: { leaveType: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!approvedLeave) return null;
    if (!isOffDayLeaveType(approvedLeave.leaveType.code)) return null;

    await this.prisma.leaveRequest.update({
      where: { id: approvedLeave.id },
      data: {
        startDate: requestedDate,
        endDate: requestedDate,
        updatedBy: actor.userId,
      },
    });

    const staleAttendance = await this.prisma.attendanceRecord.findFirst({
      where: {
        employeeId,
        companyId,
        workDate: currentDate,
        deletedAt: null,
      },
    });
    if (staleAttendance && !staleAttendance.checkInAt) {
      await this.prisma.attendanceRecord.update({
        where: { id: staleAttendance.id },
        data: {
          deletedAt: this.dates.now(),
          deletedBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    }

    if (this.attendanceLedger) {
      await this.attendanceLedger.recordOffDay(employeeId, companyId, requestedDate, 'leave');
    }

    await this.audit.record(actor, {
      entityType: 'LeaveRequest',
      entityId: approvedLeave.id,
      action: 'off_day_change_leave_swapped',
      after: {
        previousDate: currentOffDay,
        nextDate: requestedOffDay,
      },
    });

    return {
      entityType: 'LeaveRequest',
      entityId: approvedLeave.id,
      message: `เปลี่ยนวันหยุดแล้ว: ${currentOffDay} → ${requestedOffDay}`,
    };
  }

  private async hasOffDayChangeApplied(requestInstanceId: string): Promise<boolean> {
    const row = await this.prisma.requestTimelineEvent.findFirst({
      where: {
        requestInstanceId,
        eventType: 'integration_action_executed',
        message: { contains: 'เปลี่ยนวันหยุดแล้ว' },
      },
      select: { id: true },
    });
    return !!row;
  }

  /** Re-run domain integration for approved requests that never completed or failed. */
  async reconcileIncompleteIntegrations(): Promise<void> {
    const incomplete = await this.prisma.requestInstance.findMany({
      where: {
        deletedAt: null,
        status: 'approved',
        ...INCOMPLETE_INTEGRATION_FILTER,
        requestType: { key: { notIn: [...NO_INTEGRATION_TYPE_KEYS] } },
      },
      include: { requestType: { select: { key: true } } },
      orderBy: { approvedAt: 'asc' },
      take: 500,
    });

    const offDayRetry = await this.prisma.requestInstance.findMany({
      where: {
        deletedAt: null,
        status: 'approved',
        requestType: { key: 'off_day_change' },
        integrationStatus: 'completed',
        integrationEntityId: { not: null },
      },
      include: { requestType: { select: { key: true } } },
      orderBy: { approvedAt: 'asc' },
    });

    const seen = new Set<string>();
    const queue = [...incomplete, ...offDayRetry].filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    });

    let reconciled = 0;
    for (const instance of queue) {
      if (instance.requestType.key === 'off_day_change') {
        const alreadyApplied = await this.hasOffDayChangeApplied(instance.id);
        if (alreadyApplied) continue;
      }

      const actor: ActorContext = {
        ...SYSTEM_ACTOR,
        userId: instance.finalDecisionBy ?? SYSTEM_ACTOR.userId,
        companyId: instance.companyId,
      };
      try {
        await this.processApprovedRequest(actor, instance.id);
        reconciled += 1;
        this.logger.log(`Reconciled approved request ${instance.id} (${instance.requestType.key})`);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`Integration reconcile failed for ${instance.id}: ${message}`);
      }
    }
    if (reconciled > 0) {
      this.logger.log(`Reconciled ${reconciled} approved request integration(s) on startup`);
    }
  }

  /** @deprecated Use reconcileIncompleteIntegrations — kept for tests/callers. */
  async reconcileApprovedOtRequests(): Promise<void> {
    await this.reconcileIncompleteIntegrations();
  }

  /** @deprecated Use reconcileIncompleteIntegrations — kept for tests/callers. */
  async reconcileApprovedOffDayChanges(): Promise<void> {
    await this.reconcileIncompleteIntegrations();
  }

  private async integrateDocumentRequest(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    if (!this.documentRequests) {
      throw new Error('Document request service unavailable');
    }

    const result = await this.documentRequests.fulfillFromRequestPlatform(actor, {
      employeeId: instance.requesterEmployeeId,
      companyId: instance.companyId,
      typeKey: parseString(values.documentType) || 'custom',
      requestInstanceId: instance.id,
      formData: {
        language: values.language ?? null,
        purpose: values.purpose ?? null,
        deliveryMethod: values.deliveryMethod ?? null,
        dueDate: values.dueDate ?? null,
      },
    });

    await this.audit.record(actor, {
      entityType: 'DocumentRequest',
      entityId: result.documentRequestId,
      action: 'integrated_from_request',
      after: { requestInstanceId: instance.id },
    });

    return {
      entityType: 'DocumentRequest',
      entityId: result.documentRequestId,
      message: 'Document generated from approved request',
    };
  }

  private async integrateTelegramRegistrationReview(
    actor: ActorContext,
    instance: { id: string; requesterEmployeeId: string },
    values: ValuesMap,
  ): Promise<IntegrationResult> {
    if (!this.telegramRegistration) {
      throw new Error('Telegram registration integration unavailable');
    }
    return this.telegramRegistration.processApproved(actor, {
      ...values,
      employeeId: parseString(values.employeeId) || instance.requesterEmployeeId,
      requestInstanceId: instance.id,
    }) as Promise<IntegrationResult>;
  }

  private static readonly NON_REVERSIBLE_APPROVED_TYPES = new Set([
    'employee_onboarding',
    'telegram_registration_review',
    'off_day_change',
    'time_correction',
    'shift_change',
    'advance_pay',
    'document_request',
  ]);

  async processCancelledRequest(
    actor: ActorContext,
    requestInstanceId: string,
    reason?: string,
  ): Promise<void> {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: requestInstanceId, deletedAt: null },
      include: { requestType: true, values: true },
    });
    if (!instance) return;

    const typeKey = instance.requestType.key;

    if (instance.status === 'approved') {
      if (RequestIntegrationService.NON_REVERSIBLE_APPROVED_TYPES.has(typeKey)) {
        throw new Error('ไม่สามารถยกเลิกคำขอประเภทนี้หลังอนุมัติได้ — กรุณาติดต่อ HR');
      }

      if (instance.integrationStatus === 'completed' && instance.integrationEntityId) {
        await this.revertApprovedIntegration(actor, instance, reason);
      }
      return;
    }

    if (typeKey === 'leave_request') {
      await this.rejectStagedLeave(requestInstanceId, actor.userId);
    }
    if (typeKey === 'time_correction') {
      const values = valuesMapFromRows(instance.values ?? []);
      await this.syncAbsenceAfterTimeCorrectionRequest(instance, values);
    }
  }

  private async revertApprovedIntegration(
    actor: ActorContext,
    instance: {
      id: string;
      integrationEntityType: string | null;
      integrationEntityId: string | null;
      requestType: { key: string };
    },
    reason?: string,
  ): Promise<void> {
    const entityType = instance.integrationEntityType;
    const entityId = instance.integrationEntityId;
    if (!entityType || !entityId) return;

    switch (entityType) {
      case 'LeaveRequest':
        await this.revertApprovedLeave(actor, entityId);
        break;
      case 'OvertimeRecord':
        await this.revertApprovedOvertime(actor, entityId);
        break;
      case 'MonthlyOffRequest':
        await this.revertApprovedMonthlyOff(actor, entityId);
        break;
      case 'RequestInstance':
        break;
      default:
        throw new Error('ไม่สามารถยกเลิกคำขอที่เชื่อมระบบแล้วได้ — กรุณาติดต่อ HR');
    }

    await this.prisma.requestInstance.update({
      where: { id: instance.id },
      data: { integrationStatus: 'cancelled' },
    });

    await this.prisma.requestTimelineEvent.create({
      data: {
        requestInstanceId: instance.id,
        eventType: 'integration_action_executed',
        actorUserId: actor.userId,
        message: reason
          ? `ยกเลิกผลจากคำขอที่อนุมัติแล้ว: ${reason}`
          : 'ยกเลิกผลจากคำขอที่อนุมัติแล้ว',
        payloadJson: {
          action: 'reverted',
          entityType,
          entityId,
        },
      },
    });
  }

  private async revertApprovedLeave(actor: ActorContext, leaveId: string): Promise<void> {
    const leave = await this.prisma.leaveRequest.findFirst({
      where: { id: leaveId, deletedAt: null },
      include: { leaveType: true },
    });
    if (!leave || leave.status !== 'approved') return;

    const periodStart = isEmergencyLeaveType(leave.leaveType.code)
      ? halfYearPeriodContaining(leave.startDate).periodStart
      : periodStartOf(leave.startDate);

    await this.restoreLeaveConsumption({
      employeeId: leave.employeeId,
      leaveTypeId: leave.leaveTypeId,
      periodStart,
      days: Number(leave.days),
      borrowed: leave.isBorrowed,
      actorUserId: actor.userId,
    });

    await this.prisma.leaveRequest.update({
      where: { id: leaveId },
      data: { status: 'returned', updatedBy: actor.userId },
    });

    await this.audit.record(actor, {
      entityType: 'LeaveRequest',
      entityId: leaveId,
      action: 'cancelled_from_request',
      after: { days: Number(leave.days) },
    });
  }

  private async revertApprovedOvertime(actor: ActorContext, otId: string): Promise<void> {
    const ot = await this.prisma.overtimeRecord.findFirst({
      where: { id: otId, deletedAt: null },
    });
    if (!ot || ot.status !== 'approved') return;

    if (ot.payrollItemId) {
      const item = await this.prisma.payrollItem.findFirst({
        where: { id: ot.payrollItemId, deletedAt: null },
        include: { payrollCycle: true },
      });
      if (item?.payrollCycle && item.payrollCycle.status !== 'open') {
        throw new Error('ไม่สามารถยกเลิก OT ที่รวมในเงินเดือนแล้ว — กรุณาติดต่อ HR');
      }
      await this.prisma.$transaction(async (tx) => {
        if (item) {
          await tx.payrollItem.update({
            where: { id: item.id },
            data: {
              deletedAt: this.dates.now(),
              deletedBy: actor.userId,
              updatedBy: actor.userId,
            },
          });
        }
        await tx.overtimeRecord.update({
          where: { id: otId },
          data: {
            status: 'rejected',
            payrollItemId: null,
            deletedAt: this.dates.now(),
            deletedBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      });
    } else {
      await this.prisma.overtimeRecord.update({
        where: { id: otId },
        data: {
          status: 'rejected',
          deletedAt: this.dates.now(),
          deletedBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    }

    await this.audit.record(actor, {
      entityType: 'OvertimeRecord',
      entityId: otId,
      action: 'cancelled_from_request',
    });
  }

  private async revertApprovedMonthlyOff(actor: ActorContext, monthlyOffId: string): Promise<void> {
    const row = await this.prisma.monthlyOffRequest.findFirst({
      where: { id: monthlyOffId, deletedAt: null },
    });
    if (!row || row.status !== 'approved') return;

    if (this.monthlyOff) {
      await this.monthlyOff.revertAllOffDaySideEffects(
        row.employeeId,
        row.companyId,
        row.selectedDates,
      );
    }

    await this.prisma.monthlyOffRequest.update({
      where: { id: monthlyOffId },
      data: {
        status: 'rejected',
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'MonthlyOffRequest',
      entityId: monthlyOffId,
      action: 'cancelled_from_request',
    });
  }

  async processRejectedRequest(
    actor: ActorContext,
    requestInstanceId: string,
    reason?: string,
  ): Promise<void> {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: requestInstanceId, deletedAt: null },
      include: { requestType: true, values: true },
    });
    if (!instance) return;

    if (instance.requestType.key === 'leave_request') {
      await this.rejectStagedLeave(requestInstanceId, actor.userId);
      return;
    }
    if (instance.requestType.key === 'time_correction') {
      const values = valuesMapFromRows(instance.values);
      await this.syncAbsenceAfterTimeCorrectionRequest(instance, values);
      return;
    }
    if (!['telegram_registration_review', 'employee_onboarding'].includes(instance.requestType.key)) return;
    if (!this.telegramRegistration) return;

    const values = valuesMapFromRows(instance.values);
    await this.telegramRegistration.processRejected(
      actor,
      {
        ...values,
        employeeId: parseString(values.employeeId) || instance.requesterEmployeeId,
        requestInstanceId: instance.id,
      },
      reason ?? '',
    );
  }

  private async markIntegrationResult(
    actor: ActorContext,
    requestInstanceId: string,
    result: IntegrationWriteResult,
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.requestInstance.update({
        where: { id: requestInstanceId },
        data: {
          integrationStatus: result.status,
          integrationEntityType: result.entityType,
          integrationEntityId: result.entityId,
          integrationError: result.error ?? null,
          completedAt: result.status === 'completed' || result.status === 'skipped'
            ? this.dates.now()
            : undefined,
        },
      });
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId,
          eventType: 'integration_action_executed',
          actorUserId: actor.userId,
          message: result.message,
          payloadJson: {
            status: result.status,
            entityType: result.entityType,
            entityId: result.entityId,
            error: result.error ?? null,
          },
        },
      });
    });

    await this.audit.record(actor, {
      entityType: 'RequestInstance',
      entityId: requestInstanceId,
      action: result.status === 'completed' || result.status === 'skipped'
        ? 'integration_completed'
        : 'integration_failed',
      after: {
        integrationEntityType: result.entityType,
        integrationEntityId: result.entityId,
        integrationError: result.error ?? null,
      },
    });
  }

  private async syncAbsenceAfterTimeCorrectionRequest(
    instance: { requesterEmployeeId: string; companyId: string },
    values: ValuesMap,
  ): Promise<void> {
    if (!this.absenceAutoWaive) return;
    const workDateIso = parseWorkDateIso(values.attendanceDate);
    if (!workDateIso) return;
    const field = mapCorrectionTypeToField(parseString(values.correctionType));
    if (field !== 'checkInAt') return;
    await this.absenceAutoWaive.syncForWorkDay(
      instance.requesterEmployeeId,
      instance.companyId,
      new Date(`${workDateIso}T00:00:00.000Z`),
    );
  }
}

function combineDateAndTime(date: Date, time: string): Date {
  const workDateIso = date.toISOString().slice(0, 10);
  const combined = combineBangkokWorkDateAndTime(workDateIso, time);
  if (!combined) return new Date(date);
  return combined;
}
