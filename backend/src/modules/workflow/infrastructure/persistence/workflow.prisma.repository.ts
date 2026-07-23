// ============================================================================
// modules/workflow/infrastructure/persistence/workflow.prisma.repository.ts
// Persists instances/actions and resolves definitions+steps. The event
// publisher writes to the transactional outbox so source contexts can react
// asynchronously (and survive crashes). Action log writes are append-only.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  WorkflowInstance, WorkflowEntityType, StepDef, WorkflowActionType,
} from '../../domain/entities/workflow.entity';
import {
  WorkflowRepository, WorkflowEventPublisher, WorkflowResolvedEvent,
} from '../../domain/repositories/workflow.repository';

@Injectable()
export class PrismaWorkflowRepository implements WorkflowRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveDefinition(entityType: WorkflowEntityType) {
    const def = await this.prisma.workflowDefinition.findFirst({
      where: { entityType, isActive: true, deletedAt: null },
      orderBy: { version: 'desc' },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!def) return null;
    const steps: StepDef[] = def.steps.map((s) => ({
      stepOrder: s.stepOrder,
      approverRule: s.approverRule as StepDef['approverRule'],
      approverRoleId: s.approverRoleId,
      allowEscalate: s.allowEscalate,
    }));
    return { definitionId: def.id, steps };
  }

  async findInstanceById(id: string): Promise<WorkflowInstance | null> {
    const row = await this.prisma.workflowInstance.findFirst({
      where: { id, deletedAt: null },
      include: { definition: { include: { steps: true } } },
    });
    if (!row) return null;
    const steps: StepDef[] = row.definition.steps.map((s) => ({
      stepOrder: s.stepOrder,
      approverRule: s.approverRule as StepDef['approverRule'],
      approverRoleId: s.approverRoleId,
      allowEscalate: s.allowEscalate,
    }));
    return WorkflowInstance.rehydrate(
      {
        id: row.id,
        workflowDefinitionId: row.workflowDefinitionId,
        entityType: row.entityType as WorkflowEntityType,
        entityId: row.entityId,
        companyId: row.companyId,
        currentStepOrder: row.currentStepOrder,
        status: row.status as WorkflowInstance['status'],
        initiatedBy: row.initiatedBy,
        deletedAt: row.deletedAt,
      },
      steps,
    );
  }

  async saveInstance(instance: WorkflowInstance, actorUserId: string): Promise<void> {
    const p = instance.toPersistence();
    await this.prisma.workflowInstance.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        workflowDefinitionId: p.workflowDefinitionId,
        entityType: p.entityType,
        entityId: p.entityId,
        companyId: p.companyId,
        currentStepOrder: p.currentStepOrder,
        status: p.status,
        initiatedBy: p.initiatedBy,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        currentStepOrder: p.currentStepOrder,
        status: p.status,
        updatedBy: actorUserId,
      },
    });
  }

  async appendAction(input: {
    instanceId: string;
    stepOrder: number;
    action: WorkflowActionType;
    actorUserId: string;
    isOwnerOverride: boolean;
    comment: string | null;
    channel?: 'web' | 'telegram' | 'system';
  }): Promise<void> {
    await this.prisma.workflowAction.create({
      data: {
        id: randomUUID(),
        workflowInstanceId: input.instanceId,
        stepOrder: input.stepOrder,
        action: input.action,
        actorUserId: input.actorUserId,
        isOwnerOverride: input.isOwnerOverride,
        comment: input.comment ?? undefined,
        channel: input.channel ?? 'system',
      },
    });
  }
}

@Injectable()
export class OutboxWorkflowEventPublisher implements WorkflowEventPublisher {
  constructor(private readonly prisma: PrismaService) {}

  async publishResolved(event: WorkflowResolvedEvent): Promise<void> {
    await this.prisma.outboxEvent.create({
      data: {
        id: randomUUID(),
        aggregateType: 'WorkflowInstance',
        aggregateId: event.instanceId,
        eventType: `workflow.${event.status}`,
        payload: {
          entityType: event.entityType,
          entityId: event.entityId,
          status: event.status,
          companyId: event.companyId,
        },
      },
    });
  }
}
