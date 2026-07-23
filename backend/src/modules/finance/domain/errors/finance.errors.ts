// ============================================================================
// modules/finance/domain/errors/finance.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class CostCenterNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Cost center ${id} not found`); }
}
export class DuplicateCostCenterCodeError extends ConflictError {
  constructor(code: string) { super(`Cost center code "${code}" already exists in this company`); }
}
export class CostCenterCompanyMismatchError extends ValidationError {
  constructor() { super('Parent cost center must belong to the same company'); }
}

export class BudgetNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Budget ${id} not found`); }
}
export class BudgetExceededError extends ValidationError {
  constructor() { super('Transaction would exceed the remaining budget for this cost center'); }
}

export class TransactionNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Financial transaction ${id} not found`); }
}
export class TransactionNotApprovableError extends ConflictError {
  constructor(status: string) { super(`Transaction in status "${status}" cannot be approved`); }
}
export class TransactionAlreadyPostedError extends ConflictError {
  constructor() { super('Transaction has already been posted to the ledger'); }
}

export class AdvanceRequestNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Advance request ${id} not found`); }
}
export class DepositRefundNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Deposit refund ${id} not found`); }
}
export class InvalidAmountError extends ValidationError {
  constructor() { super('Amount must be greater than zero'); }
}
