// ============================================================================
// modules/payroll/domain/errors/payroll.errors.ts
// ============================================================================

import { ConflictError, NotFoundError, ValidationError } from '../../../../shared/kernel/domain-error';

export class PayrollCycleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Payroll cycle ${id} not found`); }
}

export class PayrollCycleLockedError extends ConflictError {
  constructor() { super('Payroll cycle is locked and cannot be modified'); }
}

export class PayrollCyclePaidError extends ConflictError {
  constructor() { super('Paid payroll cycle cannot be modified'); }
}

export class PayrollCycleAlreadyExistsError extends ConflictError {
  constructor() { super('A payroll cycle already exists for this company and period'); }
}

export class DepositCapExceededError extends ValidationError {
  constructor(cap?: number) {
    super(cap != null
      ? `Deposit would exceed the ${cap} THB cap for this employee`
      : 'Deposit would exceed the cap for this employee');
  }
}

export class DepositDisabledError extends ValidationError {
  constructor() { super('Deposit collection is disabled for this company'); }
}

export class PayslipAlreadyGeneratedError extends ConflictError {
  constructor() { super('มีสลิปเงินเดือนของพนักงานนี้ในรอบนี้อยู่แล้ว'); }
}

export class PayslipNotFoundError extends NotFoundError {
  constructor() { super('ยังไม่มีสลิปเงินเดือนของพนักงานนี้ในรอบนี้'); }
}

export class PayrollItemNotFoundError extends NotFoundError {
  constructor() { super('ไม่พบรายการเงินเดือนนี้'); }
}

export class PayslipNotReadyError extends ValidationError {
  constructor(message: string) {
    super(message);
  }
}

export class LeaveBonusAlreadyExistsError extends ConflictError {
  constructor() {
    super('Leave bonus payroll item already exists for this employee in this cycle');
  }
}

export class LeaveBonusOverrideNotAllowedError extends ValidationError {
  constructor() {
    super('Owner approval is required to override the normal leave bonus cap');
  }
}

export class LateDeductionAlreadyExistsError extends ConflictError {
  constructor() {
    super('Late deduction payroll item already exists for this employee in this cycle');
  }
}

export class AbsenceDeductionAlreadyExistsError extends ConflictError {
  constructor() {
    super('Absence deduction payroll item already exists for this employee in this cycle');
  }
}

export class MealAllowanceAlreadyExistsError extends ConflictError {
  constructor() {
    super('Meal allowance payroll item already exists for this employee in this cycle');
  }
}
