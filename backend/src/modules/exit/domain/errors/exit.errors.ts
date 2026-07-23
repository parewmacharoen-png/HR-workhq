// ============================================================================
// modules/exit/domain/errors/exit.errors.ts
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class ExitCaseNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Exit case ${id} not found`); }
}

export class ExitCaseAlreadyOpenError extends ConflictError {
  constructor() { super('An open exit case already exists for this employee'); }
}

export class ExitCaseInvalidStatusError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class ExitReviewForbiddenError extends ForbiddenError {
  constructor() { super('You are not authorized to review this exit case at the current step'); }
}

export class ExitChecklistIncompleteError extends ValidationError {
  constructor() { super('Exit checklist is incomplete for proper resignation'); }
}

export class ExitChecklistItemNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Exit checklist item ${id} not found`); }
}

export class ExitCancellationReasonRequiredError extends ValidationError {
  constructor() { super('cancellationReason is required to cancel an exit case'); }
}

export class ExitCancelForbiddenError extends ForbiddenError {
  constructor() { super('Only Owner or Secretary may cancel exit cases'); }
}

export class ExitCaseNotCancellableError extends ValidationError {
  constructor() { super('Exit case cannot be cancelled in its current status'); }
}

export class ExitClaimNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Deposit loss claim ${id} not found`); }
}

export class ExitAssetsUnresolvedError extends ValidationError {
  constructor(count: number) {
    super(`Cannot settle: ${count} asset(s) still pending review (ASSET-001c)`);
  }
}

export class ExitClaimShortfallWarning {
  readonly shortfall: number;
  constructor(shortfall: number) { this.shortfall = shortfall; }
}
