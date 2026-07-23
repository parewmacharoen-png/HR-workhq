// ============================================================================
// reporting/domain/errors/executive.errors.ts
// ============================================================================

import { ForbiddenError } from '../../../../shared/kernel/domain-error';

export class ExecutiveAccessDeniedError extends ForbiddenError {
  constructor() {
    super('Executive insights require owner, company manager, or marketing leader access');
  }
}
