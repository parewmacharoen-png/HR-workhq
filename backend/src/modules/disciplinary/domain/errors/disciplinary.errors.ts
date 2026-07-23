// ============================================================================
// modules/disciplinary/domain/errors/disciplinary.errors.ts
// ============================================================================

import {
  ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class DisciplinaryActionNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Disciplinary action ${id} not found`); }
}

export class DisciplinaryForbiddenError extends ForbiddenError {
  constructor() { super('You are not authorized for this disciplinary action'); }
}

export class DisciplinaryAlreadyAcknowledgedError extends ValidationError {
  constructor() { super('Disciplinary action already acknowledged'); }
}

export class DisciplinaryAcknowledgeForbiddenError extends ForbiddenError {
  constructor() { super('Only the subject employee may acknowledge this action'); }
}

export class DisciplinaryTerminationReasonRequiredError extends ValidationError {
  constructor() { super('terminationReason is required for termination actions'); }
}
