// ============================================================================
// modules/permission/domain/errors/permission.errors.ts
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError,
} from '../../../../shared/kernel/domain-error';

export class UserNotFoundError extends NotFoundError {
  constructor(id: string) { super(`User ${id} not found`); }
}

export class RoleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Role ${id} not found`); }
}

export class PermissionDeniedError extends ForbiddenError {
  constructor(permission: string) {
    super(`Missing required permission: ${permission}`);
  }
}

export class OutOfScopeError extends ForbiddenError {
  constructor() { super('Action is outside your permitted scope'); }
}

export class DuplicateRoleAssignmentError extends ConflictError {
  constructor() { super('User already has this role'); }
}

export class CannotImpersonateError extends ForbiddenError {
  constructor() { super('You are not allowed to impersonate this user'); }
}

export class OverrideNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Permission override ${id} not found`); }
}

export class SalaryAccessDeniedError extends ForbiddenError {
  constructor(reason: string) {
    super(`Salary access denied: ${reason}`);
  }
}
