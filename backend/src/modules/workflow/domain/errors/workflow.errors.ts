// ============================================================================
// modules/workflow/domain/errors/workflow.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError, ForbiddenError,
} from '../../../../shared/kernel/domain-error';

export class WorkflowDefinitionNotFoundError extends NotFoundError {
  constructor(entityType: string) {
    super(`No active workflow definition for entity type "${entityType}"`);
  }
}

export class WorkflowInstanceNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Workflow instance ${id} not found`); }
}

export class WorkflowAlreadyResolvedError extends ConflictError {
  constructor() { super('Workflow is already in a terminal state'); }
}

export class NotCurrentApproverError extends ForbiddenError {
  constructor() { super('You are not the approver for the current step'); }
}

export class InvalidWorkflowTransitionError extends ValidationError {
  constructor(action: string, status: string) {
    super(`Cannot ${action} a workflow in status ${status}`);
  }
}
