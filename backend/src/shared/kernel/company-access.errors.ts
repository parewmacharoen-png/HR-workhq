// ============================================================================
// shared/kernel/company-access.errors.ts
// Thrown when a user lacks scope for a company. Maps to 404 to avoid leaking
// whether the resource exists.
// ============================================================================

import { NotFoundError } from './domain-error';

export class CompanyAccessDeniedError extends NotFoundError {
  readonly code = 'NOT_FOUND';

  constructor() {
    super('Resource not found');
  }
}
