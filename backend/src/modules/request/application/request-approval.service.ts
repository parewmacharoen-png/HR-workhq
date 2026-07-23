import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { RequestAccessService } from './request-access.service';
import { RequestInstanceService } from './request-instance.service';
import { RequestValidationError } from '../domain/errors/request.errors';
import { ApproveRequestDto, RejectRequestDto } from './dto/request.dto';
import { RequestTelegramNotifier } from '../../telegram/application/request.notifier';
import { LeaveTeamTelegramNotifier } from '../../telegram/application/leave-team.notifier';
import { LeaveApprovalRoutingService } from '../../leave/application/leave-approval-routing.service';
import { formatLeaveDateSummary } from '../../leave/application/leave-date-summary.util';
import { valuesMapFromRows } from './request-condition.util';
import { RequestIntegrationService } from './request-integration.service';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class RequestApprovalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: RequestAccessService,
    private readonly instances: RequestInstanceService,
    private readonly integration: RequestIntegrationService,
    private readonly dates: DateProvider,
    @Inject(forwardRef(() => LeaveApprovalRoutingService))
    private readonly leaveRouting: LeaveApprovalRoutingService,
    @Optional() @Inject(forwardRef(() => RequestTelegramNotifier))
    private readonly telegram?: RequestTelegramNotifier,
    @Optional() @Inject(forwardRef(() => LeaveTeamTelegramNotifier))
    private readonly leaveTeamNotifier?: LeaveTeamTelegramNotifier,
  ) {}

  async approve(actor: ActorContext, id: string, dto: ApproveRequestDto) {
    const instance = await this.instances.getEntity(actor, id);
    if (instance.status === 'approved' && instance.integrationStatus === 'completed') {
      return this.instances.get(actor, id);
    }
    if (instance.status !== 'in_review') throw new RequestValidationError('Request is not awaiting approval');

    const currentStep = await this.prisma.requestApprovalStepInstance.findFirst({
      where: { requestInstanceId: id, status: 'pending' },
      orderBy: { stepOrder: 'asc' },
    });
    if (!currentStep) throw new RequestValidationError('No pending approval step');

    await this.access.assertCanApproveStep(actor, currentStep.approverEmployeeId, instance.companyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.requestApprovalStepInstance.update({
        where: { id: currentStep.id },
        data: { status: 'approved', actedBy: actor.userId, actedAt: this.dates.now(), note: dto.note ?? null },
      });
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'approved',
          actorUserId: actor.userId,
          message: dto.note ?? 'อนุมัติคำร้อง',
          payloadJson: { stepId: currentStep.id },
        },
      });

      const nextStep = await tx.requestApprovalStepInstance.findFirst({
        where: { requestInstanceId: id, status: 'pending', stepOrder: { gt: currentStep.stepOrder } },
        orderBy: { stepOrder: 'asc' },
      });

      if (nextStep) {
        await tx.requestInstance.update({
          where: { id },
          data: { currentStepId: nextStep.id },
        });
      } else {
        await tx.requestInstance.update({
          where: { id },
          data: {
            status: 'approved',
            approvedAt: this.dates.now(),
            currentStepId: null,
            finalDecisionBy: actor.userId,
            finalDecisionNote: dto.note ?? null,
          },
        });
        await tx.requestTimelineEvent.create({
          data: { requestInstanceId: id, eventType: 'completed', message: 'คำร้องอนุมัติครบทุกขั้นตอน' },
        });
      }
    });

    await this.audit.record(actor, { entityType: 'RequestInstance', entityId: id, action: 'approve' });
    const detail = await this.instances.get(actor, id);
    if (detail.status === 'approved') {
      await this.integration.processApprovedRequest(actor, id);
      await this.notifyLeaveTeamOutcome(id, 'approved');
    }
    if (this.telegram) await this.telegram.notifyRequesterOutcome(id);
    return detail;
  }

  async reject(actor: ActorContext, id: string, dto: RejectRequestDto) {
    const instance = await this.instances.getEntity(actor, id);
    if (instance.status !== 'in_review') throw new RequestValidationError('Request is not awaiting approval');

    const currentStep = await this.prisma.requestApprovalStepInstance.findFirst({
      where: { requestInstanceId: id, status: 'pending' },
      orderBy: { stepOrder: 'asc' },
    });
    if (!currentStep) throw new RequestValidationError('No pending approval step');
    if (currentStep.stepDefinitionId) {
      const def = await this.prisma.requestApprovalStepDefinition.findUnique({ where: { id: currentStep.stepDefinitionId } });
      if (def && !def.canReject) throw new RequestValidationError('This step cannot reject');
    }

    await this.access.assertCanApproveStep(actor, currentStep.approverEmployeeId, instance.companyId);

    await this.prisma.$transaction(async (tx) => {
      await tx.requestApprovalStepInstance.update({
        where: { id: currentStep.id },
        data: { status: 'rejected', actedBy: actor.userId, actedAt: this.dates.now(), note: dto.note },
      });
      await tx.requestApprovalStepInstance.updateMany({
        where: { requestInstanceId: id, status: 'pending', id: { not: currentStep.id } },
        data: { status: 'skipped' },
      });
      await tx.requestInstance.update({
        where: { id },
        data: {
          status: 'rejected',
          rejectedAt: this.dates.now(),
          currentStepId: null,
          finalDecisionBy: actor.userId,
          finalDecisionNote: dto.note,
        },
      });
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: id,
          eventType: 'rejected',
          actorUserId: actor.userId,
          message: dto.note,
        },
      });
    });

    await this.audit.record(actor, { entityType: 'RequestInstance', entityId: id, action: 'reject' });
    const detail = await this.instances.get(actor, id);
    if (detail.status === 'rejected') {
      await this.integration.processRejectedRequest(actor, id, dto.note);
      await this.notifyLeaveTeamOutcome(id, 'rejected');
    }
    if (this.telegram) await this.telegram.notifyRequesterOutcome(id);
    return detail;
  }

  private async notifyLeaveTeamOutcome(
    requestInstanceId: string,
    status: 'approved' | 'rejected',
  ): Promise<void> {
    if (!this.leaveTeamNotifier) return;
    const instance = await this.prisma.requestInstance.findFirst({
      where: { id: requestInstanceId, deletedAt: null },
      include: { requestType: true, values: true },
    });
    if (!instance || instance.requestType.key !== 'leave_request') return;
    const values = valuesMapFromRows(instance.values);
    const leaveType = String(values.leaveType ?? '');
    await this.leaveTeamNotifier.notifyTeam({
      requestInstanceId,
      requesterEmployeeId: instance.requesterEmployeeId,
      companyId: instance.companyId,
      leaveType,
      dateSummary: formatLeaveDateSummary(values),
      status,
      notifyBigLeaderAwareness: false,
    });
  }
}
