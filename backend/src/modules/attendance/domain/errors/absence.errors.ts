// ============================================================================
// modules/attendance/domain/errors/absence.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class AbsenceRecordNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Absence record ${id} not found`); }
}

export class AbsenceAlreadyApprovedError extends ConflictError {
  constructor() { super('Absence record is already approved'); }
}

export class AbsenceContactNotesRequiredError extends ValidationError {
  constructor() { super('Contact notes are required (minimum 10 characters)'); }
}

export class AbsenceLinkedToLockedPayrollError extends ConflictError {
  constructor() { super('Absence record is linked to payroll and cannot be changed'); }
}

export class AbsenceInvalidStatusError extends ValidationError {
  constructor(message: string) { super(message); }
}
