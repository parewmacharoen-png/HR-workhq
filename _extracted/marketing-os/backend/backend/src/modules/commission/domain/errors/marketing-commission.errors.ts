// ============================================================================
// modules/commission/domain/errors/marketing-commission.errors.ts
// ============================================================================

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class MarketingCommissionCycleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Marketing commission cycle ${id} not found`); }
}

export class MarketingCommissionCycleExistsError extends ConflictError {
  constructor() { super('Marketing commission cycle already calculated for this team and earn cycle'); }
}

export class MarketingCommissionAlreadyFinalizedError extends ConflictError {
  constructor() { super('Marketing commission cycle is already finalized'); }
}

export class MarketingTeamNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Team ${id} not found`); }
}

export class MarketingPayCycleNotFoundError extends ValidationError {
  constructor() { super('Next-month pay cycle not found — open the pay cycle before finalizing'); }
}
