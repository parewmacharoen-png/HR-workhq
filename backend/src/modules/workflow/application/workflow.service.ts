// ============================================================================
// modules/workflow/application/workflow.service.ts
// Central engine API used by every context. start() spins up an instance for a
// source record; act() applies an approver action, persists the action log,
// and — on terminal state — publishes a WorkflowResolvedEvent so the source
// context can react. Owner override is permitted from any step.
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  WORKFLOW_REPOSITORY, WORKFLOW_EVENT_PUBLISHER,
  WorkflowRepository, WorkflowEventPublisher,
} from '../domain/repositories/workflow.repository';
import {
  WorkflowInstance, WorkflowEntityType, WorkflowActionType,
} from '../domain/entities/workflow.entity';
import {
  WorkflowDefinitionNotFoundError, WorkflowInstanceNotFoundError,
  NotCurrentApproverError,
} from '../domain/errors/workflow.errors';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { WorkflowApproverService } from './workflow-approver.service';
import { ApprovalResolverService } from './approval-resolver.service';
import { ApprovalNotificationService } from './approval-notification.service';
import type { ApprovalContext } from '../domain/types/approval.types';

export interface ActOnWorkflowInput {
  action: WorkflowActionType;
  comment?: string;
  /** Set true when an Owner exercises override (resolves from any step). */
  isOwnerOverride?: boolean;
  /** For override: terminal target. Defaults to 'approved'. */
  overrideTo?: 'approved' | 'rejected';
  /** Where the action originated — stored in workflow_actions.channel */
  channel?: 'web' | 'telegram' | 'system';
}

@Injectable()
export class WorkflowService {
  constructor(
    @Inject(WORKFLOW_REPOSITORY) private readonly repo: WorkflowRepository,
    @Inject(WORKFLOW_EVENT_PUBLISHER) private readonly events: WorkflowEventPublisher,
    private readonly audit: AuditService,
    private readonly approver: WorkflowApproverService,
    private readonly approvalResolver: ApprovalResolverService,
    private readonly approvalNotifications: ApprovalNotificationService,
  ) {}

  /**
   * Start an approval for a source record. Returns the new instance id, which
   * the caller stores on its record (e.g. leave_requests.workflow_instance_id).
   */
  async start(actor: ActorContext, input: {
    entityType: WorkflowEntityType;
    entityId: string;
    companyId: string | null;
    workflowType?: string;
    approvalContext?: ApprovalContext;
  }): Promise<{ instanceId: string }> {
    let preview;
    if (input.workflowType && input.approvalContext) {
      preview = await this.approvalResolver.assertCanSubmit(input.workflowType, input.approvalContext);
    }

    const def = await this.repo.findActiveDefinition(input.entityType);
    if (!def) throw new WorkflowDefinitionNotFoundError(input.entityType);

    const instance = WorkflowInstance.start({
      id: randomUUID(),
      workflowDefinitionId: def.definitionId,
      entityType: input.entityType,
      entityId: input.entityId,
      companyId: input.companyId,
      initiatedBy: actor.userId,
      steps: def.steps,
    });
    await this.repo.saveInstance(instance, actor.userId);
    await this.audit.record(actor, {
      entityType: 'WorkflowInstance', entityId: instance.id, action: 'workflow_submitted',
      after: { ...instance.toPersistence(), workflowType: input.workflowType ?? null },
    });

    if (preview) {
      const approverUserIds = preview.approvers
        .map((a) => a.userId)
        .filter((id): id is string => !!id);
      await this.approvalNotifications.notifyApprovalRequested({
        workflowInstanceId: instance.id,
        workflowType: input.workflowType!,
        entityType: input.entityType,
        entityId: input.entityId,
        companyId: input.companyId,
        approverUserIds,
        submitterUserId: actor.userId,
      });
    }

    return { instanceId: instance.id };
  }

  async act(actor: ActorContext, instanceId: string, input: ActOnWorkflowInput): Promise<{ status: string }> {
    const instance = await this.repo.findInstanceById(instanceId);
    if (!instance) throw new WorkflowInstanceNotFoundError(instanceId);

    const bypass = await this.approver.isPlatformBypass(actor.userId);
    const isOverride = input.action === 'override' || input.isOwnerOverride === true;
    if (!bypass && !isOverride) {
      const allowed = await this.approver.isActorCurrentApprover(actor.userId, instanceId);
      if (!allowed) {
        const isOwner = await this.approver.isBusinessOwnerOrSecretary(actor.userId);
        if (isOwner && (input.action === 'approve' || input.action === 'reject')) {
          input = { ...input, isOwnerOverride: true };
        } else {
          throw new NotCurrentApproverError();
        }
      }
    }

    const before = instance.toPersistence();
    const stepAtAction = instance.currentStepOrder;

    switch (input.action) {
      case 'approve':  instance.approve(); break;
      case 'reject':   instance.reject(); break;
      case 'return':   instance.return(); break;
      case 'escalate': instance.escalate(); break;
      case 'cancel':   instance.cancel(); break;
      case 'override': instance.override(input.overrideTo ?? 'approved'); break;
    }

    await this.repo.saveInstance(instance, actor.userId);
    await this.repo.appendAction({
      instanceId: instance.id,
      stepOrder: stepAtAction,
      action: input.action,
      actorUserId: actor.userId,
      isOwnerOverride: input.isOwnerOverride ?? input.action === 'override',
      comment: input.comment ?? null,
      channel: input.channel ?? 'web',
    });
    await this.audit.record(actor, {
      entityType: 'WorkflowInstance', entityId: instance.id, action: input.action,
      before, after: instance.toPersistence(),
    });

    const notifyEvent = input.action === 'approve' ? 'approval_approved'
      : input.action === 'reject' ? 'approval_rejected'
      : input.action === 'escalate' ? 'approval_escalated'
      : null;
    if (notifyEvent) {
      let nextApproverUserIds: string[] | undefined;
      if (input.action === 'approve' && instance.status === 'pending') {
        nextApproverUserIds = await this.approver.getCurrentStepApproverUserIds(instance.id);
      }
      await this.approvalNotifications.notifyWorkflowAction({
        event: notifyEvent,
        workflowInstanceId: instance.id,
        actorUserId: actor.userId,
        entityType: instance.entityType,
        entityId: instance.entityId,
        companyId: before.companyId,
        submitterUserId: before.initiatedBy,
        comment: input.comment ?? null,
        nextApproverUserIds,
        terminalStatus: instance.isResolved
          ? (instance.status as 'approved' | 'rejected')
          : null,
      });
    }

    // Notify the source context when we hit a terminal state.
    if (instance.isResolved) {
      await this.events.publishResolved({
        instanceId: instance.id,
        entityType: instance.entityType,
        entityId: instance.entityId,
        status: instance.status as 'approved' | 'rejected' | 'cancelled',
        companyId: before.companyId,
      });
    }

    return { status: instance.status };
  }
}
