// ============================================================================
// modules/referral/domain/errors/referral.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class ReferralNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Referral ${id} not found`); }
}
export class DuplicateReferralError extends ConflictError {
  constructor() { super('The referred employee already has an active referral reward — duplicate rewards are not permitted'); }
}
export class SelfReferralError extends ValidationError {
  constructor() { super('An employee cannot refer themselves'); }
}
export class ReferralAlreadyQualifiedError extends ConflictError {
  constructor() { super('Referral is already qualified or paid'); }
}
export class ReferralAlreadyPaidError extends ConflictError {
  constructor() { super('Referral reward has already been paid'); }
}
export class ReferralRejectedError extends ConflictError {
  constructor() { super('Referral has been rejected and cannot be modified'); }
}
export class DuplicateSignalDetectedError extends ConflictError {
  constructor(signal: string) {
    super(`Duplicate detected on signal "${signal}" — referral cannot be qualified without override`);
  }
}
export class EmployeeNotYetEligibleError extends ValidationError {
  constructor(condition: string) {
    super(`Referred employee does not yet meet the qualification condition: ${condition}`);
  }
}
