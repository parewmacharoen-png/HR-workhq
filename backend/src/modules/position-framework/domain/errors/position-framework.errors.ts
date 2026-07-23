// ============================================================================
// modules/position-framework/domain/errors/position-framework.errors.ts
// KPI-004
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class PositionFamilyNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Position family ${id} not found`); }
}

export class PositionLevelNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Position level ${id} not found`); }
}

export class PositionDefinitionNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Position definition ${id} not found`); }
}

export class CareerPathNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Career path ${id} not found`); }
}

export class PromotionPathNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Promotion path ${id} not found`); }
}

export class PositionFrameworkForbiddenError extends ForbiddenError {
  constructor(message = 'You are not authorized for this position framework action') {
    super(message);
  }
}

export class PositionFrameworkValidationError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class PositionFrameworkConflictError extends ConflictError {
  constructor(message: string) { super(message); }
}
