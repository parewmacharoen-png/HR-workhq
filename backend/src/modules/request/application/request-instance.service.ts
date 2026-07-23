import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext, SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { RequestAccessService } from './request-access.service';
import { RequestTypeService } from './request-type.service';
import { RequestFormFieldService } from './request-form-field.service';
import { RequestApproverResolverService } from './request-approver-resolver.service';
import { evaluateCondition, FieldCondition, valuesMapFromRows } from './request-condition.util';
import {
  RequestNotFoundError, RequestValidationError,
} from '../domain/errors/request.errors';
import {
  AddCommentDto, CancelRequestDto, ListApprovalHistoryQuery, ListRequestsQuery, PatchRequestValuesDto,
} from './dto/request.dto';
import { RequestTelegramNotifier } from '../../telegram/application/request.notifier';
import { LeaveTeamTelegramNotifier } from '../../telegram/application/leave-team.notifier';
import { LeaveApprovalRoutingService, type LeaveApprovalRoute } from '../../leave/application/leave-approval-routing.service';
import { formatLeaveDateSummary } from '../../leave/application/leave-date-summary.util';
import { RequestIntegrationService } from './request-integration.service';
import { RequestApproverType } from '@prisma/client';
import { TeamLeaveConflictService } from '../../calendar/application/team-leave-conflict.service';
import { TeamCalendarScopeService } from '../../calendar/application/team-calendar-scope.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { buildOnboardingRequestPreview } from '../../employee-onboarding/application/onboarding-preview.builder';
import { isOnboardingRequestTypeKey, ONBOARDING_REQUEST_DISPLAY_TH } from '../../employee-onboarding/domain/employee-onboarding.constants';
import { loadEmployeeApprovalDisplayContext } from '../../../shared/employee/employee-approval-display.util';
import { buildRequestSummaryLines } from './request-summary.util';
import { RequestAttendanceGuardService } from './request-attendance-guard.service';
import {
  expandDateRangeIso,
  isShortNotice,
} from '../../leave/domain/services/leave-notice.util';

const DETAIL_INCLUDE = {
  requestType: true,
  requestTypeVersion: {
    include: { formFields: { orderBy: { order: 'asc' as const } } },
  },
  requesterEmployee: true,
  values: true,
  approvalSteps: { orderBy: { stepOrder: 'asc' as const } },
  timelineEvents: { orderBy: { createdAt: 'asc' as const } },
  comments: { orderBy: { createdAt: 'asc' as const } },
};

const MONTHLY_OFF_VIA_LEAVE_MESSAGE =
  'วันหยุดประจำเดือนไม่ใช่การลา — กรุณาใช้เมนู "🗓 แจ้งวันหยุด" ใน Telegram แทน';

@Injectable()
export class RequestInstanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RequestAccessService,
    private readonly types: RequestTypeService,
    private readonly fields: RequestFormFieldService,
    private readonly approverResolver: RequestApproverResolverService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
    private readonly calendarScope: TeamCalendarScopeService,
    private readonly leaveConflicts: TeamLeaveConflictService,
    private readonly dates: DateProvider,
    private readonly attendanceGuard: RequestAttendanceGuardService,
    @Inject(forwardRef(() => LeaveApprovalRoutingService))
    private readonly leaveRouting: LeaveApprovalRoutingService,
    @Optional() @Inject(forwardRef(() => RequestTelegramNotifier))
    private readonly telegram?: RequestTelegramNotifier,
    @Optional() @Inject(forwardRef(() => RequestIntegrationService))
    private readonly integration?: RequestIntegrationService,
    @Optional() @Inject(forwardRef(() => LeaveTeamTelegramNotifier))
    private readonly leaveTeamNotifier?: LeaveTeamTelegramNotifier,
  ) {}

  async createDraft(actor: ActorContext, typeId: string, companyId: string) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) throw new RequestValidationError('Employee profile required');

    const version = await this.types.getPublishedVersion(typeId);
    if (!version) throw new RequestNotFoundError('No published version for request type');

    const id = randomUUID();
    const instance = await this.prisma.$transaction(async (tx) => {
      const inst = await tx.requestInstance.create({
        data: {
          id,
          companyId,
          requestTypeId: typeId,
          requestTypeVersionId: version.id,
          requesterEmployeeId: access.employeeId!,
          requesterUserId: actor.userId,
          title: version.nameSnapshot,
          status: 'draft',
        },
      });
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'created',
          actorUserId: actor.userId,
          actorEmployeeId: access.employeeId,
          message: 'สร้างแบบร่างคำร้อง',
        },
      });
      return inst;
    });

    await this.audit.record(actor, { entityType: 'RequestInstance', entityId: id, action: 'create', after: instance });
    return this.get(actor, id);
  }

  async findLatestDraftForType(actor: ActorContext, typeId: string, companyId: string) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) return null;

    const row = await this.prisma.requestInstance.findFirst({
      where: {
        deletedAt: null,
        status: 'draft',
        companyId,
        requestTypeId: typeId,
        requesterEmployeeId: access.employeeId,
      },
      orderBy: { updatedAt: 'desc' },
      include: { values: true },
    });
    if (!row) return null;

    const values = valuesMapFromRows(row.values);
    return {
      id: row.id,
      typeId,
      values,
      hasProgress: Object.keys(values).length > 0,
    };
  }

  async cancelDraft(actor: ActorContext, id: string, reason?: string) {
    const instance = await this.getEntity(actor, id);
    if (instance.status !== 'draft') throw new RequestValidationError('Only draft requests can be cancelled');
    await this.prisma.requestInstance.update({
      where: { id },
      data: {
        status: 'cancelled',
        cancelledAt: this.dates.now(),
        cancelledReason: reason ?? 'ยกเลิกแบบร่าง',
      },
    });
    await this.audit.record(actor, { entityType: 'RequestInstance', entityId: id, action: 'cancel_draft' });
  }

  async patchValues(actor: ActorContext, id: string, dto: PatchRequestValuesDto) {
    const instance = await this.getEntity(actor, id);
    if (instance.status !== 'draft') throw new RequestValidationError('Only draft requests can be edited');

    const version = await this.prisma.requestTypeVersion.findUnique({
      where: { id: instance.requestTypeVersionId },
      include: { formFields: { orderBy: { order: 'asc' } } },
    });
    if (!version) throw new RequestNotFoundError();

    type FormFieldRow = {
      id: string;
      key: string;
      labelTh: string;
      fieldType: string;
      required: boolean;
      visibilityConditionJson?: unknown;
      validationJson?: unknown;
      optionsJson?: unknown;
    };

    const existingRows = await this.prisma.requestValue.findMany({ where: { requestInstanceId: id } });
    const existingValues = valuesMapFromRows(existingRows);
    const mergedValues = { ...existingValues, ...dto.values };
    const patchKeys = Object.keys(dto.values);

    const allFields = version.formFields as FormFieldRow[];
    const fieldsToPatch = allFields.filter((field) => patchKeys.includes(field.key));

    for (const field of fieldsToPatch) {
      const err = this.fields.validateFieldValue(field, dto.values[field.key]);
      if (err) throw new RequestValidationError(err);
    }

    await this.prisma.$transaction(async (tx) => {
      for (const field of fieldsToPatch) {
        const value = dto.values[field.key];
        await tx.requestValue.upsert({
          where: { requestInstanceId_fieldKey: { requestInstanceId: id, fieldKey: field.key } },
          create: {
            requestInstanceId: id,
            fieldId: field.id,
            fieldKey: field.key,
            fieldLabelSnapshot: field.labelTh,
            fieldTypeSnapshot: field.fieldType,
            valueJson: value as object,
            valueText: value != null ? String(value) : null,
          },
          update: {
            valueJson: value as object,
            valueText: value != null ? String(value) : null,
          },
        });
      }
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'value_changed',
          actorUserId: actor.userId,
          message: 'อัปเดตข้อมูลคำร้อง',
          payloadJson: dto.values as object,
        },
      });
    });

    await this.audit.record(actor, { entityType: 'RequestInstance', entityId: id, action: 'update_values' });
    return this.get(actor, id);
  }

  async submit(actor: ActorContext, id: string) {
    const instance = await this.getEntity(actor, id);
    if (instance.status !== 'draft') throw new RequestValidationError('Request already submitted');

    const version = await this.prisma.requestTypeVersion.findUnique({
      where: { id: instance.requestTypeVersionId },
      include: {
        formFields: { orderBy: { order: 'asc' } },
        approvalFlows: { where: { status: 'active' }, include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    });
    if (!version) throw new RequestNotFoundError();

    const valuesRows = await this.prisma.requestValue.findMany({ where: { requestInstanceId: id } });
    const values = valuesMapFromRows(valuesRows);
    const visible = this.fields.visibleFields(
      version.formFields as Array<{ id: string; key: string; labelTh: string; fieldType: string; required: boolean; visibilityConditionJson?: unknown; validationJson?: unknown; optionsJson?: unknown }>,
      values,
    );
    for (const field of visible) {
      const err = this.fields.validateFieldValue(field, values[field.key]);
      if (err) throw new RequestValidationError(err);
    }

    const requestType = await this.prisma.requestType.findUnique({
      where: { id: instance.requestTypeId },
      select: { key: true },
    });
    if (requestType?.key === 'leave_request' && String(values.leaveType ?? '') === 'monthly_off') {
      throw new RequestValidationError(MONTHLY_OFF_VIA_LEAVE_MESSAGE);
    }

    if (requestType?.key === 'leave_request') {
      const leaveDates = expandDateRangeIso(
        String(values.startDate ?? ''),
        String(values.endDate ?? values.startDate ?? ''),
      );
      const noticeDays = 7;
      const shortDates = leaveDates.filter((d) => isShortNotice(this.dates.now(), d, noticeDays));
      if (shortDates.length > 0) {
        const reason = String(values.reason ?? '').trim();
        if (reason.length < 3) {
          throw new RequestValidationError(
            `แจ้งลาไม่ครบ ${noticeDays} วันล่วงหน้า ต้องระบุเหตุผล (อย่างน้อย 3 ตัวอักษร) — จะถูกหักเงินเดือน 2 เท่าค่าแรงรายวัน`,
          );
        }
      }
    }

    if (requestType?.key === 'ot_request' || requestType?.key === 'no_break_report') {
      await this.attendanceGuard.assertAttendanceLinkedRequest(
        requestType.key,
        instance.requesterEmployeeId,
        instance.companyId,
        values,
        id,
      );
    }

    const flow = version.approvalFlows[0];
    const requester = await this.buildRequesterContext(instance.requesterEmployeeId, instance.companyId);
    const stepPlans = await this.resolveApprovalStepPlans(
      requestType?.key ?? '',
      flow?.steps ?? [],
      values,
      requester,
      instance.requesterEmployeeId,
      instance.companyId,
    );

    let conflictWarning: string | null = null;
    let overlappingCount = 0;
    let resolvedLeaveRoute: LeaveApprovalRoute | null = null;
    if (requestType?.key === 'leave_request') {
      const ctx = await this.leaveRouting.loadRequesterContext(
        instance.requesterEmployeeId,
        instance.companyId,
      );
      resolvedLeaveRoute = this.leaveRouting.resolveRoute(String(values.leaveType ?? ''), ctx);
    }
    if (requestType?.key === 'shift_change' || requestType?.key === 'off_day_change') {
      const dateRaw = values.effectiveDate ?? values.requestedOffDay ?? values.requestedShift;
      if (dateRaw) {
        const scope = await this.calendarScope.resolve(actor, instance.companyId);
        const memberIds = (scope.employeeIds ?? []).filter((eid) => eid !== instance.requesterEmployeeId);
        const date = this.dates.parseDate(String(dateRaw).slice(0, 10));
        const conflict = await this.leaveConflicts.checkTeamOverlap(
          actor,
          memberIds,
          instance.companyId,
          date,
          date,
        );
        conflictWarning = conflict.message || null;
        overlappingCount = conflict.overlappingCount;
      }
    } else if (requestType?.key === 'leave_request') {
      const scope = await this.calendarScope.resolve(actor, instance.companyId);
      const memberIds = (scope.employeeIds ?? []).filter((eid) => eid !== instance.requesterEmployeeId);
      const startIso = formatLeaveDateSummary(values).split(' → ')[0]?.split(',')[0]?.trim()
        ?? String(values.startDate ?? '').slice(0, 10);
      if (startIso && /^\d{4}-\d{2}-\d{2}$/.test(startIso)) {
        const date = this.dates.parseDate(startIso);
        const conflict = await this.leaveConflicts.checkTeamOverlap(
          actor,
          memberIds,
          instance.companyId,
          date,
          date,
        );
        conflictWarning = conflict.message || null;
        overlappingCount = conflict.overlappingCount;
      }
    }

    let firstStepId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      for (const plan of stepPlans) {
        const approvers = await this.approverResolver.resolve(
          plan.approverType,
          instance.requesterEmployeeId,
          instance.companyId,
          values,
          {
            approverRole: plan.approverRole,
            approverEmployeeId: plan.approverEmployeeId,
            approverFieldKey: plan.approverFieldKey,
          },
        );
        const primary = approvers[0];
        const stepInst = await tx.requestApprovalStepInstance.create({
          data: {
            requestInstanceId: id,
            stepDefinitionId: plan.stepDefinitionId,
            stepOrder: plan.stepOrder,
            approverTypeSnapshot: plan.approverType,
            approverRoleSnapshot: plan.approverRole,
            approverEmployeeId: primary?.employeeId ?? null,
            approverUserId: primary?.userId ?? null,
            status: 'pending',
          },
        });
        if (!firstStepId) firstStepId = stepInst.id;
        await tx.requestTimelineEvent.create({
          data: {
            requestInstanceId: id,
            eventType: 'step_assigned',
            message: `มอบหมายขั้นตอน: ${plan.name}`,
            payloadJson: { stepId: stepInst.id, approverEmployeeId: primary?.employeeId ?? null },
          },
        });
      }

      await tx.requestInstance.update({
        where: { id },
        data: {
          status: stepPlans.length ? 'in_review' : 'submitted',
          submittedAt: this.dates.now(),
          currentStepId: firstStepId,
        },
      });
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'submitted',
          actorUserId: actor.userId,
          message: 'ส่งคำร้องแล้ว',
        },
      });
    });

    await this.audit.record(actor, { entityType: 'RequestInstance', entityId: id, action: 'submit' });
    const detail = await this.get(actor, id);
    if (firstStepId && this.telegram) {
      const notifyText = conflictWarning ? `${conflictWarning}\n\n` : '';
      await this.telegram.notifyApproverNewRequest(id, notifyText || undefined);
    }
    if (requestType?.key === 'leave_request' && resolvedLeaveRoute) {
      await this.integration?.stageLeaveOnSubmit(actor, id, values);
      await this.leaveTeamNotifier?.notifyTeam({
        requestInstanceId: id,
        requesterEmployeeId: instance.requesterEmployeeId,
        companyId: instance.companyId,
        leaveType: String(values.leaveType ?? ''),
        dateSummary: formatLeaveDateSummary(values),
        status: 'submitted',
        notifyBigLeaderAwareness: resolvedLeaveRoute.notifyBigLeaderAwareness,
      });
    }
    if (requestType?.key === 'time_correction') {
      await this.integration?.stageTimeCorrectionOnSubmit(actor, id, values);
    }
    return { ...detail, conflictWarning, overlappingCount };
  }

  /**
   * System/Telegram path: create request already in approval workflow (never draft).
   * Status convention: `in_review` when approval steps exist, else `submitted`.
   */
  async createAndSubmitSystemRequest(params: {
    typeKey: string;
    companyId: string;
    requesterEmployeeId: string;
    requesterUserId?: string | null;
    values: Record<string, unknown>;
  }): Promise<string> {
    const requestType = await this.prisma.requestType.findFirst({
      where: { key: params.typeKey, deletedAt: null, isActive: true },
    });
    if (!requestType) throw new RequestValidationError(`Request type "${params.typeKey}" not found`);

    const version = await this.types.getPublishedVersion(requestType.id);
    if (!version) throw new RequestNotFoundError('No published version for request type');

    const values = params.values;
    const visible = this.fields.visibleFields(
      version.formFields as Array<{ id: string; key: string; labelTh: string; fieldType: string; required: boolean; visibilityConditionJson?: unknown; validationJson?: unknown; optionsJson?: unknown }>,
      values,
    );
    for (const field of visible) {
      const err = this.fields.validateFieldValue(field, values[field.key]);
      if (err) throw new RequestValidationError(err);
    }

    if (params.typeKey === 'leave_request' && String(values.leaveType ?? '') === 'monthly_off') {
      throw new RequestValidationError(MONTHLY_OFF_VIA_LEAVE_MESSAGE);
    }

    if (params.typeKey === 'ot_request' || params.typeKey === 'no_break_report') {
      await this.attendanceGuard.assertAttendanceLinkedRequest(
        params.typeKey,
        params.requesterEmployeeId,
        params.companyId,
        values,
      );
    }

    const requester = await this.buildRequesterContext(params.requesterEmployeeId, params.companyId);
    const flow = version.approvalFlows[0];
    const stepPlans = await this.resolveApprovalStepPlans(
      params.typeKey,
      flow?.steps ?? [],
      values,
      requester,
      params.requesterEmployeeId,
      params.companyId,
    );

    const id = randomUUID();
    let firstStepId: string | null = null;
    let resolvedLeaveRoute: LeaveApprovalRoute | null = null;
    if (params.typeKey === 'leave_request') {
      const ctx = await this.leaveRouting.loadRequesterContext(
        params.requesterEmployeeId,
        params.companyId,
      );
      resolvedLeaveRoute = this.leaveRouting.resolveRoute(String(values.leaveType ?? ''), ctx);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.requestInstance.create({
        data: {
          id,
          companyId: params.companyId,
          requestTypeId: requestType.id,
          requestTypeVersionId: version.id,
          requesterEmployeeId: params.requesterEmployeeId,
          requesterUserId: params.requesterUserId ?? null,
          title: version.nameSnapshot,
          status: stepPlans.length ? 'in_review' : 'submitted',
          submittedAt: this.dates.now(),
          currentStepId: null,
        },
      });

      for (const field of visible) {
        const value = values[field.key];
        await tx.requestValue.create({
          data: {
            requestInstanceId: id,
            fieldId: field.id,
            fieldKey: field.key,
            fieldLabelSnapshot: field.labelTh,
            fieldTypeSnapshot: field.fieldType,
            valueJson: value as object,
            valueText: value != null ? String(value) : null,
          },
        });
      }

      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'created',
          message: 'สร้างคำขอจากระบบ Telegram',
        },
      });

      for (const plan of stepPlans) {
        const approvers = await this.approverResolver.resolve(
          plan.approverType,
          params.requesterEmployeeId,
          params.companyId,
          values,
          {
            approverRole: plan.approverRole,
            approverEmployeeId: plan.approverEmployeeId,
            approverFieldKey: plan.approverFieldKey,
          },
        );
        const primary = approvers[0];
        const stepInst = await tx.requestApprovalStepInstance.create({
          data: {
            requestInstanceId: id,
            stepDefinitionId: plan.stepDefinitionId,
            stepOrder: plan.stepOrder,
            approverTypeSnapshot: plan.approverType,
            approverRoleSnapshot: plan.approverRole,
            approverEmployeeId: primary?.employeeId ?? null,
            approverUserId: primary?.userId ?? null,
            status: 'pending',
          },
        });
        if (!firstStepId) firstStepId = stepInst.id;
        await tx.requestTimelineEvent.create({
          data: {
            requestInstanceId: id,
            eventType: 'step_assigned',
            message: `มอบหมายขั้นตอน: ${plan.name}`,
            payloadJson: { stepId: stepInst.id, approverEmployeeId: primary?.employeeId ?? null },
          },
        });
      }

      await tx.requestInstance.update({
        where: { id },
        data: { currentStepId: firstStepId },
      });

      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'submitted',
          message: 'ส่งคำขอตรวจสอบให้ HR แล้ว',
        },
      });
    });

    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'RequestInstance',
      entityId: id,
      action: 'submit',
      after: { typeKey: params.typeKey, status: stepPlans.length ? 'in_review' : 'submitted' },
    });

    if (firstStepId && this.telegram) {
      await this.telegram.notifyApproverNewRequest(id);
    }

    if (params.typeKey === 'leave_request' && resolvedLeaveRoute) {
      const actor: ActorContext = {
        userId: params.requesterUserId ?? SYSTEM_ACTOR.userId,
        impersonatorUserId: null,
        companyId: params.companyId,
      };
      await this.integration?.stageLeaveOnSubmit(actor, id, values);
      await this.leaveTeamNotifier?.notifyTeam({
        requestInstanceId: id,
        requesterEmployeeId: params.requesterEmployeeId,
        companyId: params.companyId,
        leaveType: String(values.leaveType ?? ''),
        dateSummary: formatLeaveDateSummary(values),
        status: 'submitted',
        notifyBigLeaderAwareness: resolvedLeaveRoute.notifyBigLeaderAwareness,
      });
    }
    if (params.typeKey === 'time_correction') {
      const actor: ActorContext = {
        userId: params.requesterUserId ?? SYSTEM_ACTOR.userId,
        impersonatorUserId: null,
        companyId: params.companyId,
      };
      await this.integration?.stageTimeCorrectionOnSubmit(actor, id, values);
    }

    return id;
  }

  /** Repair: submit an existing draft telegram_registration_review into approval workflow. */
  async submitDraftTelegramRegistration(instanceId: string): Promise<void> {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: instanceId, deletedAt: null },
      include: { requestType: true },
    });
    if (!instance) throw new RequestNotFoundError();
    if (instance.requestType.key !== 'telegram_registration_review'
      && instance.requestType.key !== 'employee_onboarding') {
      throw new RequestValidationError('Not an employee onboarding request');
    }
    if (instance.status !== 'draft') {
      throw new RequestValidationError('Request is not draft');
    }

    const version = await this.prisma.requestTypeVersion.findUnique({
      where: { id: instance.requestTypeVersionId },
      include: {
        formFields: { orderBy: { order: 'asc' } },
        approvalFlows: { where: { status: 'active' }, include: { steps: { orderBy: { stepOrder: 'asc' } } } },
      },
    });
    if (!version) throw new RequestNotFoundError();

    const valuesRows = await this.prisma.requestValue.findMany({ where: { requestInstanceId: instanceId } });
    const values = valuesMapFromRows(valuesRows);
    const requester = await this.buildRequesterContext(instance.requesterEmployeeId, instance.companyId);
    const flow = version.approvalFlows[0];
    const applicableSteps = (flow?.steps ?? []).filter((s) => evaluateCondition(
      s.conditionJson as FieldCondition | null,
      values,
      requester,
    ));

    let firstStepId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      await tx.requestApprovalStepInstance.deleteMany({ where: { requestInstanceId: instanceId } });

      for (const stepDef of applicableSteps) {
        const approvers = await this.approverResolver.resolve(
          stepDef.approverType,
          instance.requesterEmployeeId,
          instance.companyId,
          values,
          {
            approverRole: stepDef.approverRole,
            approverEmployeeId: stepDef.approverEmployeeId,
            approverFieldKey: stepDef.approverFieldKey,
          },
        );
        const primary = approvers[0];
        const stepInst = await tx.requestApprovalStepInstance.create({
          data: {
            requestInstanceId: instanceId,
            stepDefinitionId: stepDef.id,
            stepOrder: stepDef.stepOrder,
            approverTypeSnapshot: stepDef.approverType,
            approverRoleSnapshot: stepDef.approverRole,
            approverEmployeeId: primary?.employeeId ?? null,
            approverUserId: primary?.userId ?? null,
            status: 'pending',
          },
        });
        if (!firstStepId) firstStepId = stepInst.id;
      }

      await tx.requestInstance.update({
        where: { id: instanceId },
        data: {
          status: applicableSteps.length ? 'in_review' : 'submitted',
          submittedAt: this.dates.now(),
          currentStepId: firstStepId,
        },
      });

      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: instanceId,
          eventType: 'submitted',
          message: 'ส่งคำขอตรวจสอบให้ HR แล้ว (repair)',
        },
      });
    });

    if (firstStepId && this.telegram) {
      await this.telegram.notifyApproverNewRequest(instanceId);
    }
  }

  async cancel(actor: ActorContext, id: string, dto: CancelRequestDto) {
    const instance = await this.getEntity(actor, id);
    const access = await this.permissions.findUserAccess(actor.userId);
    const isOwner = access?.employeeId === instance.requesterEmployeeId;
    if (!isOwner) await this.access.assertCanViewCompanyRequests(actor, instance.companyId);
    if (['rejected', 'cancelled', 'completed'].includes(instance.status)) {
      throw new RequestValidationError('Cannot cancel request in current status');
    }

    try {
      await this.integration?.processCancelledRequest(actor, id, dto.reason);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Cannot cancel request';
      throw new RequestValidationError(message);
    }

    await this.prisma.$transaction(async (tx) => {
      await tx.requestInstance.update({
        where: { id },
        data: { status: 'cancelled', cancelledAt: this.dates.now(), cancelledReason: dto.reason ?? null },
      });
      await tx.requestApprovalStepInstance.updateMany({
        where: { requestInstanceId: id, status: 'pending' },
        data: { status: 'cancelled' },
      });
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'cancelled',
          actorUserId: actor.userId,
          message: dto.reason ?? 'ยกเลิกคำร้อง',
        },
      });
    });

    await this.audit.record(actor, { entityType: 'RequestInstance', entityId: id, action: 'cancel' });
    return this.get(actor, id);
  }

  async addComment(actor: ActorContext, id: string, dto: AddCommentDto) {
    const instance = await this.getEntity(actor, id);
    await this.access.assertCanViewRequest(actor, instance.requesterEmployeeId, instance.companyId);
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) throw new RequestValidationError('Employee profile required');

    const comment = await this.prisma.requestComment.create({
      data: {
        requestInstanceId: id,
        authorEmployeeId: access.employeeId,
        comment: dto.comment,
        visibility: (dto.visibility ?? 'requester_visible') as never,
      },
    });
    await this.prisma.requestTimelineEvent.create({
      data: {
        requestInstanceId: id,
        eventType: 'comment_added',
        actorEmployeeId: access.employeeId,
        actorUserId: actor.userId,
        message: dto.comment,
      },
    });
    await this.audit.record(actor, { entityType: 'RequestComment', entityId: comment.id, action: 'create' });
    return comment;
  }

  async get(actor: ActorContext, id: string) {
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id, deletedAt: null },
      include: DETAIL_INCLUDE,
    });
    if (!instance) throw new RequestNotFoundError();
    await this.access.assertCanViewRequest(actor, instance.requesterEmployeeId, instance.companyId);

    const typeKey = instance.requestType.key;
    const values = valuesMapFromRows(instance.values);
    const onboardingPreview = await buildOnboardingRequestPreview(
      this.prisma,
      typeKey,
      values,
      instance.companyId,
    );

    return {
      ...instance,
      requestType: {
        ...instance.requestType,
        nameTh: isOnboardingRequestTypeKey(typeKey) ? ONBOARDING_REQUEST_DISPLAY_TH : instance.requestType.nameTh,
      },
      onboardingPreview,
    };
  }

  async listMy(actor: ActorContext) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access?.employeeId) return [];
    const rows = await this.prisma.requestInstance.findMany({
      where: { requesterEmployeeId: access.employeeId, deletedAt: null },
      include: DETAIL_INCLUDE,
      orderBy: { createdAt: 'desc' },
    });
    return Promise.all(rows.map((row) => this.enrichListRow(row)));
  }

  async listPendingApproval(actor: ActorContext) {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (!access) return [];
    const rows = await this.prisma.requestInstance.findMany({
      where: {
        deletedAt: null,
        status: 'in_review',
        approvalSteps: { some: this.pendingStepFilter(actor, access) },
      },
      include: DETAIL_INCLUDE,
      orderBy: { submittedAt: 'desc' },
    });

    return Promise.all(rows.map((instance) => this.enrichListRow(instance)));
  }

  /** Owner/secretary see all pending steps; others only assigned steps. */
  private pendingStepFilter(
    actor: ActorContext,
    access: NonNullable<Awaited<ReturnType<BusinessPermissionRepository['findUserAccess']>>>,
  ) {
    const role = access.businessRole;
    if (role === 'owner' || role === 'secretary') {
      return { status: 'pending' as const };
    }
    return {
      status: 'pending' as const,
      OR: [
        ...(access.employeeId ? [{ approverEmployeeId: access.employeeId }] : []),
        { approverUserId: actor.userId },
      ],
    };
  }

  async list(actor: ActorContext, query: ListRequestsQuery) {
    if (!query.companyId) throw new RequestValidationError('companyId required');
    await this.access.assertCanViewCompanyRequests(actor, query.companyId);

    const rows = await this.prisma.requestInstance.findMany({
      where: this.buildListWhere(query),
      include: DETAIL_INCLUDE,
      orderBy: { submittedAt: 'desc' },
      take: 200,
    });
    return Promise.all(rows.map((row) => this.enrichListRow(row)));
  }

  /** Submitted request history for approvals hub (excludes draft/cancelled). */
  async listApprovalHistory(actor: ActorContext, query: ListApprovalHistoryQuery) {
    await this.access.assertCanViewCompanyRequests(actor, query.companyId);

    const statusFilter = query.status
      ? { status: query.status as never }
      : { status: { in: ['in_review', 'submitted', 'approved', 'rejected', 'completed'] as never } };

    const rows = await this.prisma.requestInstance.findMany({
      where: {
        companyId: query.companyId,
        deletedAt: null,
        submittedAt: { not: null },
        ...statusFilter,
        ...(query.requestTypeKey ? { requestType: { key: query.requestTypeKey } } : {}),
        ...(query.category ? { requestType: { category: query.category as never } } : {}),
        ...(query.dateFrom || query.dateTo ? {
          submittedAt: {
            ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
            ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59`) } : {}),
          },
        } : {}),
      },
      include: DETAIL_INCLUDE,
      orderBy: { submittedAt: 'desc' },
      take: query.limit ?? 100,
    });

    return Promise.all(rows.map(async (row) => {
      const enriched = await this.enrichListRow(row);
      const resolvedAt = row.approvedAt ?? row.rejectedAt ?? row.completedAt;
      return {
        ...enriched,
        lastActionAt: resolvedAt?.toISOString() ?? row.submittedAt?.toISOString() ?? null,
        lastAction: row.status === 'approved' ? 'approve'
          : row.status === 'rejected' ? 'reject'
            : row.status === 'in_review' ? 'pending'
              : null,
        lastChannel: 'telegram' as const,
        resolvedAt: resolvedAt?.toISOString() ?? null,
      };
    }));
  }

  private buildListWhere(query: ListRequestsQuery) {
    return {
      companyId: query.companyId,
      deletedAt: null,
      ...(query.requestTypeId ? { requestTypeId: query.requestTypeId } : {}),
      ...(query.requestTypeKey ? { requestType: { key: query.requestTypeKey } } : {}),
      ...(query.category ? { requestType: { category: query.category as never } } : {}),
      ...(query.status
        ? { status: query.status as never }
        : { status: { notIn: ['draft', 'cancelled'] as never } }),
      ...(query.requesterEmployeeId ? { requesterEmployeeId: query.requesterEmployeeId } : {}),
      ...(query.dateFrom || query.dateTo ? {
        submittedAt: {
          ...(query.dateFrom ? { gte: new Date(query.dateFrom) } : {}),
          ...(query.dateTo ? { lte: new Date(`${query.dateTo}T23:59:59`) } : {}),
        },
      } : {}),
    };
  }

  private async enrichListRow<T extends {
    requestType: { key: string; nameTh: string; icon?: string | null; category?: string };
    values: Array<{ fieldKey: string; valueJson: unknown; valueText: string | null }>;
    requesterEmployeeId: string;
    companyId: string;
    title: string;
    status: string;
    submittedAt: Date | null;
    createdAt?: Date;
  }>(instance: T) {
    const typeKey = instance.requestType.key;
    const values = valuesMapFromRows(instance.values);
    const summaryLines = buildRequestSummaryLines(typeKey, values, {
      submittedAt: instance.submittedAt ?? instance.createdAt ?? new Date(),
    });
    const onboardingPreview = await buildOnboardingRequestPreview(
      this.prisma,
      typeKey,
      values,
      instance.companyId,
    );
    const requesterContext = await loadEmployeeApprovalDisplayContext(
      this.prisma,
      instance.requesterEmployeeId,
      instance.companyId,
    );
    return {
      ...instance,
      requestType: {
        ...instance.requestType,
        nameTh: isOnboardingRequestTypeKey(typeKey) ? ONBOARDING_REQUEST_DISPLAY_TH : instance.requestType.nameTh,
      },
      summaryLines,
      onboardingPreview,
      requesterContext,
    };
  }

  async getEntity(actor: ActorContext, id: string) {
    const instance = await this.prisma.requestInstance.findFirst({ where: { id, deletedAt: null } });
    if (!instance) throw new RequestNotFoundError();
    await this.access.assertCanViewRequest(actor, instance.requesterEmployeeId, instance.companyId);
    return instance;
  }

  private async buildRequesterContext(employeeId: string, companyId: string) {
    const emp = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, companyId, effectiveTo: null, deletedAt: null },
    });
    const access = await this.prisma.user.findFirst({
      where: { employeeId },
      include: { businessRoleAssignments: { where: { isActive: true, deletedAt: null } } },
    });
    const hireDate = emp?.hireDate ?? this.dates.now();
    const tenureDays = Math.floor((this.dates.now().getTime() - hireDate.getTime()) / 86400000);
    return {
      companyId,
      position: emp?.position ?? null,
      role: access?.businessRoleAssignments[0]?.role ?? null,
      teamId: assignment?.teamId ?? null,
      tenureDays,
    };
  }

  private async resolveApprovalStepPlans(
    typeKey: string,
    flowSteps: Array<{
      id: string;
      stepOrder: number;
      name: string;
      approverType: RequestApproverType;
      approverRole: string | null;
      approverEmployeeId: string | null;
      approverFieldKey: string | null;
      conditionJson: unknown;
    }>,
    values: Record<string, unknown>,
    requester: Awaited<ReturnType<RequestInstanceService['buildRequesterContext']>>,
    requesterEmployeeId: string,
    companyId: string,
  ): Promise<Array<{
    stepDefinitionId: string | null;
    stepOrder: number;
    name: string;
    approverType: RequestApproverType;
    approverRole: string | null;
    approverEmployeeId: string | null;
    approverFieldKey: string | null;
    leaveRoute?: LeaveApprovalRoute;
  }>> {
    if (typeKey === 'leave_request') {
      const ctx = await this.leaveRouting.loadRequesterContext(requesterEmployeeId, companyId);
      const leaveType = String(values.leaveType ?? '');
      const route = this.leaveRouting.resolveRoute(leaveType, ctx);
      return [{
        stepDefinitionId: flowSteps[0]?.id ?? null,
        stepOrder: 1,
        name: route.stepLabel,
        approverType: route.approverType,
        approverRole: null,
        approverEmployeeId: null,
        approverFieldKey: null,
        leaveRoute: route,
      }];
    }

    return (flowSteps ?? [])
      .filter((s) => evaluateCondition(s.conditionJson as FieldCondition | null, values, requester))
      .map((s) => ({
        stepDefinitionId: s.id,
        stepOrder: s.stepOrder,
        name: s.name,
        approverType: s.approverType,
        approverRole: s.approverRole,
        approverEmployeeId: s.approverEmployeeId,
        approverFieldKey: s.approverFieldKey,
      }));
  }
}
