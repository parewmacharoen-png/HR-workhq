// ============================================================================
// modules/exit/domain/errors/final-settlement.errors.ts
// PAY-005
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class FinalSettlementNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Final settlement ${id} not found`); }
}

export class FinalSettlementForExitNotFoundError extends NotFoundError {
  constructor(exitCaseId: string) { super(`No final settlement for exit case ${exitCaseId}`); }
}

export class FinalSettlementAlreadyExistsError extends ConflictError {
  constructor() { super('A final settlement already exists for this exit case'); }
}

export class FinalSettlementInvalidStatusError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class FinalSettlementForbiddenError extends ForbiddenError {
  constructor(message = 'You are not authorized for this final settlement action') {
    super(message);
  }
}
