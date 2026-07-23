// ============================================================================
// modules/recruitment/domain/errors/recruitment.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class CandidateNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Candidate ${id} not found`); }
}
export class DuplicateCandidatePhoneError extends ConflictError {
  constructor(phone: string) { super(`A candidate with phone "${phone}" already exists in this company`); }
}
export class InvalidStageTransitionError extends ValidationError {
  constructor(from: string, to: string) {
    super(`Cannot move candidate from stage "${from}" to "${to}"`);
  }
}
export class InterviewNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Interview ${id} not found`); }
}
export class OfferNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Offer ${id} not found`); }
}
export class OfferAlreadyRespondedError extends ConflictError {
  constructor() { super('Offer has already been accepted, declined, or expired'); }
}
export class InvalidOfferTransitionError extends ValidationError {
  constructor(from: string, to: string) {
    super(`Cannot transition offer from "${from}" to "${to}"`);
  }
}
export class CandidateNotHiredError extends ValidationError {
  constructor() { super('Candidate must be in "hired" or "started" stage to mark as started'); }
}
export class NoActiveEarnCycleError extends ValidationError {
  constructor(companyId: string) {
    super(`No active payroll earn cycle found for company ${companyId} — cannot count KPI candidate`);
  }
}
