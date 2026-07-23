// ============================================================================
// modules/workflow/domain/repositories/workflow.repository.ts
// ============================================================================

import { WorkflowInstance, WorkflowEntityType, StepDef, WorkflowActionType } from '../entities/workflow.entity';

export const WORKFLOW_REPOSITORY = Symbol('WORKFLOW_REPOSITORY');
export const WORKFLOW_EVENT_PUBLISHER = Symbol('WORKFLOW_EVENT_PUBLISHER');

export interface WorkflowRepository {
  /** Find the active definition + its steps for an entity type. */
  findActiveDefinition(entityType: WorkflowEntityType): Promise<{ definitionId: string; steps: StepDef[] } | null>;
  findInstanceById(id: string): Promise<WorkflowInstance | null>;
  saveInstance(instance: WorkflowInstance, actorUserId: string): Promise<void>;
  appendAction(input: {
    instanceId: string;
    stepOrder: number;
    action: WorkflowActionType;
    actorUserId: string;
    isOwnerOverride: boolean;
    comment: string | null;
    channel?: 'web' | 'telegram' | 'system';
  }): Promise<void>;
}

/**
 * Published when a workflow reaches a terminal state, so the originating
 * context (Leave, Overtime, etc.) can react (e.g. mark request approved).
 */
export interface WorkflowResolvedEvent {
  instanceId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  status: 'approved' | 'rejected' | 'cancelled';
  companyId: string | null;
}

export interface WorkflowEventPublisher {
  publishResolved(event: WorkflowResolvedEvent): Promise<void>;
}
