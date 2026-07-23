// ============================================================================
// modules/security/domain/errors/security.errors.ts
// ============================================================================

import { ConflictError, ForbiddenError, NotFoundError } from '../../../../shared/kernel/domain-error';

export class TelegramAccessDeniedError extends ForbiddenError {
  constructor(message = 'Telegram access denied') {
    super(message);
  }
}

export class TelegramIdentityNotFoundError extends NotFoundError {
  constructor(id?: string) {
    super(id ? `Telegram identity ${id} not found` : 'Telegram identity not found');
  }
}

export class RegistrationRequestNotFoundError extends NotFoundError {
  constructor(id?: string) {
    super(id ? `Registration request ${id} not found` : 'Registration request not found');
  }
}

export class RegistrationRequestNotPendingError extends ConflictError {
  constructor() {
    super('Registration request is not pending');
  }
}

export class EmployeeAlreadyLinkedError extends ConflictError {
  constructor() {
    super('Employee already has an active Telegram identity');
  }
}

export class TelegramAlreadyLinkedError extends ConflictError {
  constructor() {
    super('This Telegram account is already linked to another employee');
  }
}
