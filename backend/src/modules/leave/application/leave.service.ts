// ============================================================================
// modules/leave/application/leave.service.ts
// Leave requests + holiday->bonus conversion. Requesting leave validates the
// balance (allowing borrow only when the type permits), opens an approval
// workflow, and reacts to workflow resolution to apply/skip balance changes.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  LEAVE_REPOSITORY, HOLIDAY_CONVERSION_REPOSITORY,
  LeaveRepository, HolidayConversionRepository,
} from '../domain/repositories/leave.repository';
import { LeaveRequest } from '../domain/entities/leave-request.entity';
import {
  HolidayConversionService,
  toHolidayConversionParams,
} from '../domain/services/holiday-conversion.service';
import {
  LeaveTypeNotFoundError, LeaveRequestNotFoundError,
  InsufficientLeaveBalanceError, BorrowNotAllowedError, HolidayConversionExistsError,
  LeaveRescheduleNotFoundError, LeaveShiftSwapNotFoundError,
  LeaveRescheduleNotAllowedError, LeaveShiftSwapNotAllowedError,
  LeaveDateOverlapError, PendingLeaveRescheduleExistsError,
  EmergencyLeaveNotEligibleError,
  LeaveRequestModificationNotAllowedError,
} from '../domain/errors/leave.errors';
import {
  RequestLeaveDto, ConvertHolidayDto, LeaveRequestResponse, HolidayConversionResponse,
  RequestLeaveRescheduleDto, RequestLeaveShiftSwapDto,
  ApprovedLeaveSummaryResponse, LeaveRescheduleResponse, LeaveShiftSwapResponse,
  LeaveBalanceSummaryResponse, UpdateLeaveRequestDto,
} from './dto/leave.dto';
import {
  computeEndDateFromStart,
  computeInclusiveLeaveDays,
  toLeavePolicyConfig,
  validateRescheduleRequest,
  validateShiftSwapRequest,
} from '../domain/services/leave-reschedule-policy.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import { isEmergencyLeaveType } from '../domain/services/leave-type-classification';
import {
  computeEmergencyLeaveEntitlement,
  halfYearPeriodContaining,
} from '../domain/services/emergency-leave-entitlement.service';
import { ValidationError } from '../../../shared/kernel/domain-error';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { resolveLeaveWorkflowType } from '../../workflow/domain/types/approval.types';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TeamLeaveConflictService } from '../../calendar/application/team-leave-conflict.service';
import { TeamCalendarScopeService } from '../../calendar/application/team-calendar-scope.service';
import { DateProvider } from '../../../shared/time/date.provider';
import {
  cancelLinkedApprovals,
  syncLeaveRequestFormValues,
} from '../../../shared/kernel/cancel-linked-approvals';
import {
  EmployeeDayConflictService,
  expandIsoDateRange,
} from './employee-day-conflict.service';

@Injectable()
export class LeaveService {
  constructor(
    @Inject(LEAVE_REPOSITORY) private readonly leave: LeaveRepository,
    @Inject(HOLIDAY_CONVERSION_REPOSITORY) private readonly conversions: HolidayConversionRepository,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly prisma: PrismaService,
    private readonly leaveSettings: LeaveSettingsService,
    private readonly calendarScope: TeamCalendarScopeService,
    private readonly leaveConflicts: TeamLeaveConflictService,
    private readonly dates: DateProvider,
    private readonly dayConflicts: EmployeeDayConflictService,
  ) {}

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async validateEmergencyLeaveRequest(
    actor: ActorContext,
    employeeId: string,
    dto: RequestLeaveDto,
    leaveTypeId: string,
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        hireDate: true,
        employmentStatus: true,
        probationEndDate: true,
      },
    });
    if (!employee) throw new LeaveRequestNotFoundError(employeeId);

    const rules = await this.leaveSettings.getRules(dto.companyId);
    const requestDate = new Date(dto.startDate);
    const entitlement = computeEmergencyLeaveEntitlement({
      hireDate: employee.hireDate,
      requestDate,
      employmentStatus: employee.employmentStatus,
      probationEndDate: employee.probationEndDate,
      rules,
    });

    if (!entitlement.eligible) {
      throw new EmergencyLeaveNotEligibleError(entitlement.reason);
    }

    await this.leave.ensureEmergencyBalance({
      employeeId,
      leaveTypeId,
      periodStart: entitlement.period.periodStart,
      periodEnd: entitlement.period.periodEnd,
      entitled: entitlement.entitled,
      actorUserId: actor.userId,
    });

    const balance = await this.leave.getBalance(
      employeeId,
      leaveTypeId,
      entitlement.period.periodStart,
    );
    if (dto.days > (balance?.remaining ?? 0)) {
      throw new InsufficientLeaveBalanceError();
    }
  }

  private periodStartOf(date: Date): Date {
    // payroll cycle anchor (25th). Balances are keyed by period start.
    const d = new Date(date);
    const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 25));
    if (d.getUTCDate() < 25) start.setUTCMonth(start.getUTCMonth() - 1);
    return start;
  }

  private async resolvePeriodStartForType(
    leaveTypeCode: string,
    startDate: Date,
  ): Promise<Date> {
    return isEmergencyLeaveType(leaveTypeCode)
      ? halfYearPeriodContaining(startDate).periodStart
      : this.periodStartOf(startDate);
  }

  private async releaseApprovedConsumption(
    request: LeaveRequest,
    actorUserId: string,
  ): Promise<void> {
    const p = request.toPersistence();
    if (p.status !== 'approved') return;
    const leaveType = await this.leave.findTypeById(p.leaveTypeId);
    if (!leaveType) return;
    const periodStart = await this.resolvePeriodStartForType(leaveType.code, p.startDate);
    await this.leave.releaseConsumption({
      employeeId: p.employeeId,
      leaveTypeId: p.leaveTypeId,
      periodStart,
      days: p.days,
      borrowed: p.isBorrowed,
      actorUserId,
    });
  }

  private async applyApprovedConsumption(
    request: LeaveRequest,
    actorUserId: string,
  ): Promise<void> {
    const p = request.toPersistence();
    if (p.status !== 'approved') return;
    const leaveType = await this.leave.findTypeById(p.leaveTypeId);
    if (!leaveType) return;
    const periodStart = await this.resolvePeriodStartForType(leaveType.code, p.startDate);
    await this.leave.applyConsumption({
      employeeId: p.employeeId,
      leaveTypeId: p.leaveTypeId,
      periodStart,
      days: p.days,
      borrowed: p.isBorrowed,
      actorUserId,
    });
  }

  async updateLeaveRequest(
    actor: ActorContext,
    id: string,
    dto: UpdateLeaveRequestDto,
  ): Promise<LeaveRequestResponse> {
    const request = await this.leave.findRequestById(id);
    if (!request) throw new LeaveRequestNotFoundError(id);
    const before = request.toPersistence();
    if (before.deletedAt) throw new LeaveRequestNotFoundError(id);
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, before.employeeId, before.companyId);

    if (await this.leave.hasPendingReschedule(id)) {
      throw new LeaveRequestModificationNotAllowedError('มีคำขอเลื่อนวันลารออนุมัติอยู่ — ไม่สามารถแก้ไขได้');
    }

    const hasFieldChange = dto.leaveTypeCode
      || dto.startDate
      || dto.endDate
      || dto.days != null
      || dto.reason !== undefined;
    if (!hasFieldChange) {
      throw new LeaveRequestModificationNotAllowedError('ไม่มีข้อมูลที่ต้องแก้ไข');
    }

    const nextType = dto.leaveTypeCode
      ? await this.leave.findTypeByCode(dto.leaveTypeCode)
      : await this.leave.findTypeById(before.leaveTypeId);
    if (!nextType) {
      throw new LeaveTypeNotFoundError(dto.leaveTypeCode ?? before.leaveTypeId);
    }

    const nextStart = dto.startDate ? new Date(dto.startDate) : before.startDate;
    const nextEnd = dto.endDate ? new Date(dto.endDate) : before.endDate;
    const nextDays = dto.days ?? before.days;
    const nextReason = dto.reason !== undefined ? (dto.reason || null) : before.reason;

    await this.dayConflicts.assertNoConflict({
      employeeId: before.employeeId,
      companyId: before.companyId,
      dates: expandIsoDateRange(
        nextStart.toISOString().slice(0, 10),
        nextEnd.toISOString().slice(0, 10),
      ),
      excludeLeaveRequestId: id,
    });

    if (before.status === 'approved') {
      await this.releaseApprovedConsumption(request, actor.userId);
    }

    request.adminUpdate({
      leaveTypeId: nextType.id,
      startDate: nextStart,
      endDate: nextEnd,
      days: nextDays,
      reason: nextReason,
    });
    await this.leave.saveRequest(request, actor.userId);

    if (before.status === 'approved') {
      await this.applyApprovedConsumption(request, actor.userId);
    }

    await syncLeaveRequestFormValues(this.prisma, {
      leaveRequestId: id,
      startDate: nextStart.toISOString().slice(0, 10),
      endDate: nextEnd.toISOString().slice(0, 10),
      days: nextDays,
      reason: nextReason,
      leaveTypeCode: nextType.code,
    });

    await this.audit.record(actor, {
      entityType: 'LeaveRequest',
      entityId: id,
      action: 'update',
      before,
      after: {
        ...request.toPersistence(),
        correctionReason: dto.correctionReason,
      },
    });

    return this.getRequest(actor, id);
  }

  async deleteLeaveRequest(actor: ActorContext, id: string): Promise<void> {
    const request = await this.leave.findRequestById(id);
    if (!request) throw new LeaveRequestNotFoundError(id);
    const before = request.toPersistence();
    if (before.deletedAt) throw new LeaveRequestNotFoundError(id);
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, before.employeeId, before.companyId);

    if (await this.leave.hasPendingReschedule(id)) {
      throw new LeaveRequestModificationNotAllowedError('มีคำขอเลื่อนวันลารออนุมัติอยู่ — ไม่สามารถลบได้');
    }

    if (before.status === 'approved') {
      await this.releaseApprovedConsumption(request, actor.userId);
    }

    await this.leave.softDeleteRequest(id, actor.userId);

    await cancelLinkedApprovals(this.prisma, {
      entityType: 'LeaveRequest',
      workflowEntityType: 'leave',
      entityId: id,
      actorUserId: actor.userId,
      reason: 'ลบจากประวัติการลา — ยกเลิกคำขอและผลที่เกี่ยวข้องทั้งระบบ',
      now: this.dates.now(),
    });

    await this.audit.record(actor, {
      entityType: 'LeaveRequest',
      entityId: id,
      action: 'delete',
      before,
    });
  }

  /** Dates affected by a leave request (inclusive ISO dates) for payroll rebuild. */
  leaveAffectedDates(startDate: Date, endDate: Date): string[] {
    const dates: string[] = [];
    const cursor = new Date(Date.UTC(
      startDate.getUTCFullYear(),
      startDate.getUTCMonth(),
      startDate.getUTCDate(),
    ));
    const end = new Date(Date.UTC(
      endDate.getUTCFullYear(),
      endDate.getUTCMonth(),
      endDate.getUTCDate(),
    ));
    while (cursor <= end) {
      dates.push(cursor.toISOString().slice(0, 10));
      cursor.setUTCDate(cursor.getUTCDate() + 1);
    }
    return dates;
  }

  async requestLeave(actor: ActorContext, employeeId: string, dto: RequestLeaveDto): Promise<LeaveRequestResponse> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);
    const type = await this.leave.findTypeByCode(dto.leaveTypeCode);
    if (!type) throw new LeaveTypeNotFoundError(dto.leaveTypeCode);

    let isBorrowed = false;
    if (isEmergencyLeaveType(type.code)) {
      await this.validateEmergencyLeaveRequest(actor, employeeId, dto, type.id);
    } else {
      const periodStart = this.periodStartOf(new Date(dto.startDate));
      const balance = await this.leave.getBalance(employeeId, type.id, periodStart);
      const remaining = balance?.remaining ?? 0;
      const wantsBorrow = dto.isBorrowed ?? false;

      if (dto.days > remaining) {
        if (!wantsBorrow) throw new InsufficientLeaveBalanceError();
        if (!type.allowBorrowFuture) throw new BorrowNotAllowedError();
      }
      isBorrowed = wantsBorrow && dto.days > remaining;
    }

    await this.dayConflicts.assertNoConflict({
      employeeId,
      companyId: dto.companyId,
      dates: expandIsoDateRange(dto.startDate, dto.endDate),
    });

    const request = LeaveRequest.create({
      id: randomUUID(),
      employeeId,
      companyId: dto.companyId,
      leaveTypeId: type.id,
      startDate: new Date(dto.startDate),
      endDate: new Date(dto.endDate),
      days: dto.days,
      isBorrowed,
      reason: dto.reason ?? null,
    });
    await this.leave.saveRequest(request, actor.userId);

    const workflowType = resolveLeaveWorkflowType(dto.leaveTypeCode);
    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'leave',
      entityId: request.id,
      companyId: dto.companyId,
      workflowType,
      approvalContext: {
        employeeId,
        companyId: dto.companyId,
        leaveTypeCode: dto.leaveTypeCode,
      },
    });
    request.attachWorkflow(instanceId);
    await this.leave.saveRequest(request, actor.userId);

    await this.audit.record(actor, {
      entityType: 'LeaveRequest', entityId: request.id, action: 'create',
      after: request.toPersistence(),
    });

    const scope = await this.calendarScope.resolve(actor, dto.companyId);
    const memberIds = (scope.employeeIds ?? []).filter((id) => id !== employeeId);
    const conflict = await this.leaveConflicts.checkTeamOverlap(
      actor,
      memberIds,
      dto.companyId,
      this.dates.parseDate(dto.startDate),
      this.dates.parseDate(dto.endDate),
    );

    const p = request.toPersistence();
    return {
      id: p.id,
      status: p.status,
      workflowInstanceId: p.workflowInstanceId,
      isBorrowed: p.isBorrowed,
      conflictWarning: conflict.message || null,
      overlappingCount: conflict.overlappingCount,
    };
  }

  async listApprovedLeaveRequests(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<ApprovedLeaveSummaryResponse[]> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, companyId);
    const rules = await this.leaveSettings.getRules(companyId);
    const rows = await this.leave.listApprovedRequestsByEmployee(employeeId, companyId);
    const eligible: ApprovedLeaveSummaryResponse[] = [];
    for (const row of rows) {
      if (row.rescheduleCount >= rules.maxReschedulesPerRequest) continue;
      if (await this.leave.hasPendingReschedule(row.id)) continue;
      eligible.push({
        id: row.id,
        startDate: row.startDate.toISOString().slice(0, 10),
        endDate: row.endDate.toISOString().slice(0, 10),
        days: row.days,
        rescheduleCount: row.rescheduleCount,
        leaveTypeName: row.leaveTypeName,
      });
    }
    return eligible;
  }

  async requestReschedule(
    actor: ActorContext,
    employeeId: string,
    dto: RequestLeaveRescheduleDto,
  ): Promise<LeaveRescheduleResponse> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);

    const leaveRequest = await this.leave.findRequestById(dto.leaveRequestId);
    if (!leaveRequest) throw new LeaveRequestNotFoundError(dto.leaveRequestId);

    const p = leaveRequest.toPersistence();
    if (p.employeeId !== employeeId || p.companyId !== dto.companyId) {
      throw new LeaveRescheduleNotAllowedError('Leave request does not belong to this employee');
    }
    if (p.status !== 'approved') {
      throw new LeaveRescheduleNotAllowedError('Only approved leave can be rescheduled');
    }
    if (await this.leave.hasPendingReschedule(p.id)) {
      throw new PendingLeaveRescheduleExistsError();
    }

    const newStartDate = new Date(dto.newStartDate);
    const newEndDate = computeEndDateFromStart(newStartDate, p.days);
    const newDays = computeInclusiveLeaveDays(newStartDate, newEndDate);
    const policy = toLeavePolicyConfig(await this.leaveSettings.getRules(dto.companyId));

    try {
      validateRescheduleRequest({
        originalStartDate: p.startDate,
        originalEndDate: p.endDate,
        originalDays: p.days,
        newStartDate,
        newEndDate,
        newDays,
        reason: dto.reason,
        isEmergency: dto.isEmergency ?? false,
        rescheduleCount: p.rescheduleCount,
        submittedAt: this.dates.now(),
      }, policy);
    } catch (err) {
      if (err instanceof ValidationError) throw new LeaveRescheduleNotAllowedError(err.message);
      throw err;
    }

    if (await this.leave.hasApprovedDateOverlap(dto.companyId, newStartDate, newEndDate, p.id)) {
      throw new LeaveDateOverlapError();
    }

    const rescheduleId = await this.leave.createRescheduleRequest({
      leaveRequestId: p.id,
      employeeId: p.employeeId,
      companyId: p.companyId,
      originalStartDate: p.startDate,
      originalEndDate: p.endDate,
      originalDays: p.days,
      newStartDate,
      newEndDate,
      newDays,
      reason: dto.reason.trim(),
      isEmergency: dto.isEmergency ?? false,
    }, actor.userId);

    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'leave_reschedule',
      entityId: rescheduleId,
      companyId: dto.companyId,
      workflowType: 'leave_reschedule',
      approvalContext: { employeeId: p.employeeId, companyId: dto.companyId },
    });
    await this.leave.attachRescheduleWorkflow(rescheduleId, instanceId, actor.userId);

    await this.audit.record(actor, {
      entityType: 'LeaveRescheduleRequest',
      entityId: rescheduleId,
      action: 'create',
      after: { leaveRequestId: p.id, newStartDate, newEndDate, isEmergency: dto.isEmergency ?? false },
    });

    return {
      id: rescheduleId,
      status: 'pending',
      workflowInstanceId: instanceId,
      leaveRequestId: p.id,
      newStartDate: newStartDate.toISOString().slice(0, 10),
      newEndDate: newEndDate.toISOString().slice(0, 10),
    };
  }

  async onRescheduleWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    const reschedule = await this.leave.findRescheduleByWorkflowEntity(entityId);
    if (!reschedule || reschedule.status !== 'pending') return;

    if (status === 'approved') {
      const overlap = await this.leave.hasApprovedDateOverlap(
        reschedule.companyId,
        reschedule.newStartDate,
        reschedule.newEndDate,
        reschedule.leaveRequestId,
      );
      if (overlap) {
        await this.leave.updateRescheduleStatus(reschedule.id, 'rejected', reschedule.employeeId);
        return;
      }
      await this.leave.applyApprovedReschedule(reschedule, reschedule.employeeId);
    } else {
      await this.leave.updateRescheduleStatus(
        reschedule.id,
        status === 'rejected' ? 'rejected' : 'rejected',
        reschedule.employeeId,
      );
    }
  }

  async getRescheduleRequest(actor: ActorContext, id: string): Promise<LeaveRescheduleResponse> {
    const reschedule = await this.leave.findRescheduleById(id);
    if (!reschedule) throw new LeaveRescheduleNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, reschedule.companyId);
    return {
      id: reschedule.id,
      status: reschedule.status,
      workflowInstanceId: reschedule.workflowInstanceId,
      leaveRequestId: reschedule.leaveRequestId,
      newStartDate: reschedule.newStartDate.toISOString().slice(0, 10),
      newEndDate: reschedule.newEndDate.toISOString().slice(0, 10),
    };
  }

  async requestShiftSwap(
    actor: ActorContext,
    employeeId: string,
    dto: RequestLeaveShiftSwapDto,
  ): Promise<LeaveShiftSwapResponse> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);

    const requesterLeave = await this.leave.findRequestById(dto.requesterLeaveRequestId);
    const partnerLeave = await this.leave.findRequestById(dto.partnerLeaveRequestId);
    if (!requesterLeave) throw new LeaveRequestNotFoundError(dto.requesterLeaveRequestId);
    if (!partnerLeave) throw new LeaveRequestNotFoundError(dto.partnerLeaveRequestId);

    const req = requesterLeave.toPersistence();
    const partner = partnerLeave.toPersistence();
    if (req.employeeId !== employeeId || req.companyId !== dto.companyId) {
      throw new LeaveShiftSwapNotAllowedError('Requester leave does not belong to this employee');
    }
    if (partner.companyId !== dto.companyId) {
      throw new LeaveShiftSwapNotAllowedError('Partner leave must belong to the same company');
    }

    try {
      validateShiftSwapRequest({
        requesterLeave: {
          employeeId: req.employeeId,
          companyId: req.companyId,
          startDate: req.startDate,
          endDate: req.endDate,
          days: req.days,
          status: req.status,
        },
        partnerLeave: {
          employeeId: partner.employeeId,
          companyId: partner.companyId,
          startDate: partner.startDate,
          endDate: partner.endDate,
          days: partner.days,
          status: partner.status,
        },
        submittedAt: this.dates.now(),
      }, toLeavePolicyConfig(await this.leaveSettings.getRules(dto.companyId)));
    } catch (err) {
      if (err instanceof ValidationError) throw new LeaveShiftSwapNotAllowedError(err.message);
      throw err;
    }

    const swapId = await this.leave.createShiftSwapRequest({
      companyId: dto.companyId,
      requesterEmployeeId: req.employeeId,
      partnerEmployeeId: partner.employeeId,
      requesterLeaveRequestId: req.id,
      partnerLeaveRequestId: partner.id,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'LeaveShiftSwapRequest',
      entityId: swapId,
      action: 'create',
      after: {
        requesterLeaveRequestId: req.id,
        partnerLeaveRequestId: partner.id,
      },
    });

    return { id: swapId, status: 'pending_partner', workflowInstanceId: null };
  }

  async agreeShiftSwap(actor: ActorContext, swapId: string): Promise<LeaveShiftSwapResponse> {
    const swap = await this.leave.findShiftSwapById(swapId);
    if (!swap) throw new LeaveShiftSwapNotFoundError(swapId);
    await this.companyAccess.assertCompanyAccess(actor, swap.companyId);

    const actorEmployeeId = await this.leave.findEmployeeIdForUser(actor.userId);
    if (!actorEmployeeId || actorEmployeeId !== swap.partnerEmployeeId) {
      throw new LeaveShiftSwapNotAllowedError('Only the partner employee can agree to this swap');
    }

    if (swap.status !== 'pending_partner') {
      throw new LeaveShiftSwapNotAllowedError('Shift swap is not awaiting partner agreement');
    }

    await this.leave.markShiftSwapPartnerAgreed(swapId, actor.userId);

    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'leave_shift_swap',
      entityId: swapId,
      companyId: swap.companyId,
      workflowType: 'leave_shift_swap',
      approvalContext: { employeeId: swap.requesterEmployeeId, companyId: swap.companyId },
    });
    await this.leave.attachShiftSwapWorkflow(swapId, instanceId, actor.userId);

    return { id: swapId, status: 'pending_approval', workflowInstanceId: instanceId };
  }

  async onShiftSwapWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    const swap = await this.leave.findShiftSwapByWorkflowEntity(entityId);
    if (!swap || swap.status !== 'pending_approval') return;

    if (status === 'approved') {
      await this.leave.applyApprovedShiftSwap(swap, swap.requesterEmployeeId);
    } else {
      await this.leave.updateShiftSwapStatus(swap.id, 'rejected', swap.requesterEmployeeId);
    }
  }

  async getShiftSwapRequest(actor: ActorContext, id: string): Promise<LeaveShiftSwapResponse> {
    const swap = await this.leave.findShiftSwapById(id);
    if (!swap) throw new LeaveShiftSwapNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, swap.companyId);
    return {
      id: swap.id,
      status: swap.status,
      workflowInstanceId: swap.workflowInstanceId,
    };
  }

  /**
   * Reaction to a resolved leave workflow (called by the outbox handler).
   * On approval, consume the balance (marking borrowed days if applicable).
   */
  async onWorkflowResolved(entityId: string, status: 'approved' | 'rejected' | 'cancelled'): Promise<void> {
    const request = await this.leave.findRequestByWorkflowEntity(entityId);
    if (!request) return;
    const p = request.toPersistence();

    if (status === 'approved') {
      request.markApproved();
      await this.leave.saveRequest(request, p.employeeId);
      const leaveType = await this.leave.findTypeById(p.leaveTypeId);
      const periodStart = leaveType && isEmergencyLeaveType(leaveType.code)
        ? halfYearPeriodContaining(p.startDate).periodStart
        : this.periodStartOf(p.startDate);
      await this.leave.applyConsumption({
        employeeId: p.employeeId,
        leaveTypeId: p.leaveTypeId,
        periodStart,
        days: p.days,
        borrowed: p.isBorrowed,
        actorUserId: p.employeeId,
      });
    } else {
      request.markRejected();
      await this.leave.saveRequest(request, p.employeeId);
    }
  }

  /** Convert unused holiday days to a bonus for a payroll cycle. */
  async convertHoliday(actor: ActorContext, employeeId: string, dto: ConvertHolidayDto): Promise<HolidayConversionResponse> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, dto.companyId);
    if (await this.conversions.exists(employeeId, dto.payrollCycleId)) {
      throw new HolidayConversionExistsError();
    }
    const rules = await this.leaveSettings.getRules(dto.companyId);
    const holiday = new HolidayConversionService(toHolidayConversionParams(rules));
    const result = holiday.compute({
      unusedDays: dto.unusedDays,
      overrideCap: dto.overrideCap,
      customCap: dto.customCap ?? null,
    });
    const id = await this.conversions.create({
      employeeId,
      companyId: dto.companyId,
      payrollCycleId: dto.payrollCycleId,
      result,
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'HolidayConversion', entityId: id, action: 'create',
      after: { employeeId, ...result },
    });
    return {
      id,
      unusedDays: result.unusedDays,
      bonusAmount: result.bonusAmount,
      overrideCap: result.overrideCap,
    };
  }

  async getRequest(actor: ActorContext, id: string): Promise<LeaveRequestResponse> {
    const request = await this.leave.findRequestById(id);
    if (!request) throw new LeaveRequestNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, request.toPersistence().companyId);
    const p = request.toPersistence();
    return { id: p.id, status: p.status, workflowInstanceId: p.workflowInstanceId, isBorrowed: p.isBorrowed };
  }

  async listRequests(actor: ActorContext, companyId: string, status?: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.leaveRequest.findMany({
      where: {
        companyId,
        deletedAt: null,
        ...(status ? { status: status as never } : {}),
      },
      include: {
        employee: { select: { id: true, firstName: true, lastName: true, globalId: true } },
        leaveType: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      employeeId: row.employeeId,
      employeeName: `${row.employee.firstName} ${row.employee.lastName}`,
      globalId: row.employee.globalId,
      leaveType: row.leaveType.name,
      leaveTypeCode: row.leaveType.code,
      startDate: row.startDate.toISOString().slice(0, 10),
      endDate: row.endDate.toISOString().slice(0, 10),
      days: Number(row.days),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listRescheduleRequests(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.leaveRescheduleRequest.findMany({
      where: { companyId, deletedAt: null },
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
      originalStartDate: row.originalStartDate.toISOString().slice(0, 10),
      originalEndDate: row.originalEndDate.toISOString().slice(0, 10),
      proposedStartDate: row.newStartDate.toISOString().slice(0, 10),
      proposedEndDate: row.newEndDate.toISOString().slice(0, 10),
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async listShiftSwaps(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.leaveShiftSwapRequest.findMany({
      where: { companyId, deletedAt: null },
      include: {
        requesterEmployee: { select: { firstName: true, lastName: true, globalId: true } },
        partnerEmployee: { select: { firstName: true, lastName: true, globalId: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((row) => ({
      id: row.id,
      requesterEmployeeId: row.requesterEmployeeId,
      requesterName: `${row.requesterEmployee.firstName} ${row.requesterEmployee.lastName}`,
      partnerEmployeeId: row.partnerEmployeeId,
      partnerName: `${row.partnerEmployee.firstName} ${row.partnerEmployee.lastName}`,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async getEmployeeLeaveBalances(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<LeaveBalanceSummaryResponse[]> {
    await this.employeeAccess.assertEmployeeSelfOrCompany(actor, employeeId, companyId);
    const types = await this.prisma.leaveType.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
    const ref = this.dates.now();
    const balances: LeaveBalanceSummaryResponse[] = [];
    for (const type of types) {
      const periodStart = isEmergencyLeaveType(type.code)
        ? halfYearPeriodContaining(ref).periodStart
        : this.periodStartOf(ref);
      const bal = await this.leave.getBalance(employeeId, type.id, periodStart);
      if (!bal && !['annual', 'sick', 'emergency', 'unpaid'].includes(type.code)) continue;
      balances.push({
        leaveTypeCode: type.code,
        leaveTypeName: type.name,
        entitled: bal?.entitled ?? 0,
        used: bal?.used ?? 0,
        remaining: bal?.remaining ?? 0,
        periodStart: periodStart.toISOString().slice(0, 10),
      });
    }
    return balances;
  }
}
