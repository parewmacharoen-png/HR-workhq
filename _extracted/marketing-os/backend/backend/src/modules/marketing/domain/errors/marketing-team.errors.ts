// ============================================================================
// modules/marketing/domain/errors/marketing-team.errors.ts
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class MarketingTeamNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Marketing team ${id} not found`); }
}

export class MarketingTeamMemberNotFoundError extends NotFoundError {
  constructor(employeeId: string, teamId: string) {
    super(`Employee ${employeeId} is not an active member of marketing team ${teamId}`);
  }
}

export class DuplicateMarketingTeamCodeError extends ConflictError {
  constructor(code: string) { super(`Marketing team code "${code}" already exists`); }
}

export class MarketingTeamAccessDeniedError extends ForbiddenError {
  constructor() { super('You do not have permission to view this marketing team'); }
}

export class InvalidMarketingTeamStructureError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class ActiveMarketingTeamMembershipExistsError extends ConflictError {
  constructor(employeeId: string) {
    super(`Employee ${employeeId} already has an active primary marketing team`);
  }
}
