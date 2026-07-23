// ============================================================================
// modules/commission/domain/errors/commission.errors.ts
// ============================================================================

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class CommissionRecordNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Commission record ${id} not found`); }
}
export class CommissionAlreadyFinalizedError extends ConflictError {
  constructor() { super('Commission record is already paid or redistributed'); }
}
export class SplitRatioMustSumToOneError extends ValidationError {
  constructor() { super('Commission split ratios must sum to exactly 1.00'); }
}
export class BigLeaderLedgerExistsError extends ConflictError {
  constructor() { super('Big-leader ledger entry already exists for this cycle'); }
}
