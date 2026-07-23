// ============================================================================
// modules/marketing/domain/errors/marketing.errors.ts
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class MarketingDailyReportNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Marketing daily report ${id} not found`); }
}

export class MarketingDailyReportNotEditableError extends ValidationError {
  constructor(status: string) {
    super(`Report in status "${status}" cannot be edited`);
  }
}

export class InvalidMarketingReportTransitionError extends ValidationError {
  constructor(from: string, action: string) {
    super(`Cannot ${action} report from status "${from}"`);
  }
}

export class DuplicateMarketingDailyReportError extends ConflictError {
  constructor(reportDate: string) {
    super(`A report already exists for date ${reportDate}`);
  }
}

export class MarketingEmployeeNotLinkedError extends ValidationError {
  constructor() { super('No employee profile linked to this user'); }
}

export class MarketingCycleLockedError extends ConflictError {
  constructor(earnCycleId: string) {
    super(`Marketing earn cycle ${earnCycleId} is locked`);
  }
}

export class MarketingEditReasonRequiredError extends ValidationError {
  constructor() { super('Edit reason is required'); }
}

export class MarketingReportAccessDeniedError extends ForbiddenError {
  constructor() { super('You do not have permission to modify this report'); }
}

export class MarketingExpenseNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Marketing expense ${id} not found`); }
}

export class MarketingExpenseNotEditableError extends ValidationError {
  constructor(status: string) {
    super(`Expense in status "${status}" cannot be edited`);
  }
}

export class InvalidMarketingExpenseTransitionError extends ValidationError {
  constructor(from: string, action: string) {
    super(`Cannot ${action} expense from status "${from}"`);
  }
}
