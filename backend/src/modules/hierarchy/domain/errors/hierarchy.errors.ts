// ============================================================================
// modules/hierarchy/domain/errors/hierarchy.errors.ts
// ============================================================================

import { DomainError, NotFoundError } from '../../../../shared/kernel/domain-error';

export class EmployeeHierarchyNotFoundError extends NotFoundError {
  constructor(employeeId: string) {
    super(`No active reporting line found for employee ${employeeId}`);
  }
}

export class SelfReportingNotAllowedError extends DomainError {
  readonly code = 'SELF_REPORTING_NOT_ALLOWED';
  readonly httpStatus = 422;

  constructor() {
    super('Employee cannot report to themselves.');
  }
}

export class CircularHierarchyNotAllowedError extends DomainError {
  readonly code = 'CIRCULAR_HIERARCHY_NOT_ALLOWED';
  readonly httpStatus = 422;

  constructor() {
    super('Circular reporting hierarchy is not allowed.');
  }
}

export class OwnerCannotHaveManagerError extends DomainError {
  readonly code = 'OWNER_CANNOT_HAVE_MANAGER';
  readonly httpStatus = 422;

  constructor() {
    super('Owner must be top-level and cannot have a manager.');
  }
}

export class CompanyScopeConsistencyError extends DomainError {
  readonly code = 'COMPANY_SCOPE_CONSISTENCY';
  readonly httpStatus = 422;

  constructor() {
    super('Manager and employee must belong to the same company for reporting lines.');
  }
}
