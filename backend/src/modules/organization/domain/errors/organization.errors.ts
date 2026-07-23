// ============================================================================
// modules/organization/domain/errors/organization.errors.ts
// ============================================================================

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class CompanyNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Company ${id} not found`);
  }
}

export class DuplicateCompanyCodeError extends ConflictError {
  constructor(code: string) {
    super(`A company with code "${code}" already exists`);
  }
}

export class TeamNotFoundError extends NotFoundError {
  constructor(id: string) {
    super(`Team ${id} not found`);
  }
}

export class DuplicateTeamNameError extends ConflictError {
  constructor(name: string) {
    super(`A team named "${name}" already exists in this company`);
  }
}

export class TeamCompanyMismatchError extends ValidationError {
  constructor() {
    super('Parent team must belong to the same company');
  }
}
