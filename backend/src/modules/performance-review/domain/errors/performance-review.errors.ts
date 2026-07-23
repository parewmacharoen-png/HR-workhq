// ============================================================================
// modules/performance-review/domain/errors/performance-review.errors.ts
// KPI-003
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class PerformanceWeightProfileNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Performance weight profile ${id} not found`); }
}

export class PerformanceReviewCycleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Performance review cycle ${id} not found`); }
}

export class PerformanceReviewNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Performance review ${id} not found`); }
}

export class PerformanceReviewForbiddenError extends ForbiddenError {
  constructor(message = 'You are not authorized for this performance review action') {
    super(message);
  }
}

export class PerformanceReviewInvalidStatusError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class PerformanceReviewConflictError extends ConflictError {
  constructor(message: string) { super(message); }
}
