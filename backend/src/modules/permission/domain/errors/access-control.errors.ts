// ============================================================================
// HR-13 access control validation errors.
// ============================================================================

import { ForbiddenError, ValidationError } from '../../../../shared/kernel/domain-error';

export type AccessControlRuleCode =
  | 'OWNER_REQUIRED'
  | 'COMPANY_SCOPE_REQUIRED'
  | 'TEAM_SCOPE_REQUIRED'
  | 'SCOPE_NOT_ALLOWED'
  | 'HARD_SELF_ONLY'
  | 'OWNER_ONLY_OVERRIDE'
  | 'NO_LINKED_USER'
  | 'ASSIGN_OWNER_FORBIDDEN'
  | 'ROLE_CHANGE_FORBIDDEN';

export class AccessControlValidationError extends ValidationError {
  readonly rule: AccessControlRuleCode;

  constructor(rule: AccessControlRuleCode, message: string) {
    super(message);
    this.rule = rule;
  }
}

export class OwnerOnlyOverrideError extends ForbiddenError {
  readonly rule: AccessControlRuleCode = 'OWNER_ONLY_OVERRIDE';

  constructor() {
    super('Only an Owner may manage additional access overrides.');
  }
}
