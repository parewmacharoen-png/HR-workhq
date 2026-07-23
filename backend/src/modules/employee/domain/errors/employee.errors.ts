// ============================================================================
// modules/employee/domain/errors/employee.errors.ts
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class EmployeeNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Employee ${id} not found`);
  }
}

export class DuplicateGlobalIdError extends ConflictError {
  constructor(globalId: string) {
    super(`Employee global id ${globalId} already in use`);
  }
}

export class CannotRehireActiveEmployeeError extends ValidationError {
  constructor() {
    super('Cannot rehire an employee who is not terminated');
  }
}

export class OverlappingAssignmentError extends ConflictError {
  constructor() {
    super('Employee already has an active assignment in this company for the period');
  }
}

export class MultiplePrimaryCompanyError extends ConflictError {
  constructor() {
    super('Employee already has a primary company assignment');
  }
}

export class EmployeeOnboardForbiddenError extends ForbiddenError {
  constructor() {
    super('Only Owner and Secretary can add employees.');
  }
}
