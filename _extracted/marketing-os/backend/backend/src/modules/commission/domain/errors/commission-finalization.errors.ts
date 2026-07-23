// ============================================================================
// modules/commission/domain/errors/commission-finalization.errors.ts
// ============================================================================

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class CommissionCycleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Commission cycle ${id} not found`); }
}

export class CommissionCycleLockedError extends ConflictError {
  constructor(earnCycleId: string) {
    super(`Commission cycle for earn period ${earnCycleId} is locked`);
    this.name = 'CommissionCycleLockedError';
  }
}

export class CommissionCycleInvalidTransitionError extends ValidationError {
  constructor(from: string, action: string) {
    super(`Cannot ${action} commission cycle in status ${from}`);
  }
}

export class CommissionCycleSourceNotFoundError extends NotFoundError {
  constructor(type: string, sourceCycleId: string) {
    super(`No ${type} commission source found for ${sourceCycleId}`);
  }
}

/** Future corrections must use Commission Adjustment Workflow (not implemented). */
export class CommissionAdjustmentRequiredError extends ValidationError {
  constructor() {
    super('Direct commission edits are not allowed — use Commission Adjustment Workflow');
  }
}
