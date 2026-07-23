// ============================================================================
// modules/payroll/domain/errors/payroll-export.errors.ts
// PAY-006
// ============================================================================

import {
  ConflictError, ForbiddenError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class PayrollExportBatchNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Payroll export batch ${id} not found`); }
}

export class PayrollExportForbiddenError extends ForbiddenError {
  constructor(message = 'You are not authorized for payroll bank export') {
    super(message);
  }
}

export class PayrollExportCycleNotApprovedError extends ValidationError {
  constructor() {
    super('Payroll cycle must be locked or paid before bank transfer export');
  }
}

export interface PayrollExportExceptionRow {
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  exceptionFlags: string[];
}

export class PayrollExportExceptionsBlockedError extends ValidationError {
  readonly details: { exceptions: PayrollExportExceptionRow[] };

  constructor(exceptions: PayrollExportExceptionRow[]) {
    super('Export blocked due to payroll exceptions; Owner confirmation required');
    this.details = { exceptions };
  }
}

export class PayrollExportBatchCancelledError extends ConflictError {
  constructor() { super('This export batch has been cancelled'); }
}

export class PayrollExportInvalidFormatError extends ValidationError {
  constructor(format: string) { super(`Unsupported export format: ${format}`); }
}
