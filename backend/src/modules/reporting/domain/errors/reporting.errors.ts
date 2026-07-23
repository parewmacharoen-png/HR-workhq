// ============================================================================
// modules/reporting/domain/errors/reporting.errors.ts
// ============================================================================

import { NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class SnapshotNotFoundError extends NotFoundError {
  constructor(type: string, date: string) {
    super(`No snapshot of type "${type}" found for date ${date}`);
  }
}
export class InvalidDateRangeError extends ValidationError {
  constructor() { super('from date must not be after to date'); }
}
export class CompanyNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Company ${id} not found`); }
}
