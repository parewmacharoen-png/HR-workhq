// ============================================================================
// modules/workflow/domain/errors/approval.errors.ts
// ============================================================================

import { DomainError } from '../../../../shared/kernel/domain-error';

export class NoApproverFoundError extends DomainError {
  readonly code = 'NO_APPROVER_FOUND';
  readonly httpStatus = 422;

  constructor(workflowType: string) {
    super(`No approver could be resolved for workflow type "${workflowType}".`);
  }
}

export class OwnerApprovalRequiredError extends DomainError {
  readonly code = 'OWNER_APPROVAL_REQUIRED';
  readonly httpStatus = 422;

  constructor() {
    super('Owner approval is required for this workflow type.');
  }
}

export class MinApproversNotMetError extends DomainError {
  readonly code = 'MIN_APPROVERS_NOT_MET';
  readonly httpStatus = 422;

  constructor(required: number, resolved: number) {
    super(`At least ${required} approver(s) required, but only ${resolved} could be resolved.`);
  }
}

export class ApprovalMatrixNotFoundError extends DomainError {
  readonly code = 'NOT_FOUND';
  readonly httpStatus = 404;

  constructor(workflowType: string) {
    super(`No active approval matrix found for workflow type "${workflowType}".`);
  }
}
