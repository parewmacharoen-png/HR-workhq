// ============================================================================
// modules/salary-review/domain/errors/salary-review.errors.ts
// SAL-001
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class SalaryReviewNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Salary review ${id} not found`); }
}

export class PromotionReviewNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Promotion review ${id} not found`); }
}

export class CompensationReviewForbiddenError extends ForbiddenError {
  constructor(message = 'You are not authorized for this compensation review action') {
    super(message);
  }
}

export class CompensationReviewInvalidStatusError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class CompensationReviewConflictError extends ConflictError {
  constructor(message: string) { super(message); }
}
