// ============================================================================
// modules/kpi/domain/errors/kpi.errors.ts
// KPI-001
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class KpiTemplateNotFoundError extends NotFoundError {
  constructor(id: string) { super(`KPI template ${id} not found`); }
}

export class KpiCycleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`KPI cycle ${id} not found`); }
}

export class KpiAssignmentNotFoundError extends NotFoundError {
  constructor(id: string) { super(`KPI assignment ${id} not found`); }
}

export class KpiForbiddenError extends ForbiddenError {
  constructor(message = 'You are not authorized for this KPI action') {
    super(message);
  }
}

export class KpiInvalidStatusError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class KpiConflictError extends ConflictError {
  constructor(message: string) { super(message); }
}
