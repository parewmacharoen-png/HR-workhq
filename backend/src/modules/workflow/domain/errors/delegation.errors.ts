// ============================================================================
// modules/workflow/domain/errors/delegation.errors.ts
// ============================================================================

import { DomainError } from '../../../../shared/kernel/domain-error';

export class DelegationNotFoundError extends DomainError {
  readonly code = 'DELEGATION_NOT_FOUND';
  readonly httpStatus = 404;

  constructor() {
    super('Delegation not found.');
  }
}

export class DelegationForbiddenError extends DomainError {
  readonly code = 'DELEGATION_FORBIDDEN';
  readonly httpStatus = 403;

  constructor() {
    super('Only the delegator can revoke this delegation.');
  }
}

export class DelegateSelfNotAllowedError extends DomainError {
  readonly code = 'DELEGATE_SELF_NOT_ALLOWED';
  readonly httpStatus = 422;

  constructor() {
    super('Cannot delegate to yourself.');
  }
}

export class InvalidDelegationPeriodError extends DomainError {
  readonly code = 'INVALID_DELEGATION_PERIOD';
  readonly httpStatus = 422;

  constructor() {
    super('End date must be after start date.');
  }
}

export class DelegateNotFoundError extends DomainError {
  readonly code = 'DELEGATE_NOT_FOUND';
  readonly httpStatus = 422;

  constructor() {
    super('Delegate user not found.');
  }
}
