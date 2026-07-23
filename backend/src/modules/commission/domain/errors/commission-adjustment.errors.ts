// ============================================================================
// modules/commission/domain/errors/commission-adjustment.errors.ts
// ============================================================================

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class CommissionAdjustmentNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Commission adjustment ${id} not found`); }
}

export class CommissionCycleNotLockedForAdjustmentError extends ValidationError {
  constructor() { super('Commission cycle must be locked before submitting an adjustment'); }
}

export class CommissionAdjustmentInvalidTransitionError extends ValidationError {
  constructor(from: string, action: string) {
    super(`Cannot ${action} commission adjustment in status ${from}`);
  }
}

export class CommissionAdjustmentSourceNotFoundError extends NotFoundError {
  constructor(message: string) { super(message); }
}

export class CommissionAdjustmentAlreadyAppliedError extends ConflictError {
  constructor() { super('Commission adjustment has already been applied'); }
}
