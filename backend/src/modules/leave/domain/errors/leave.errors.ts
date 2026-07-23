// ============================================================================
// modules/leave/domain/errors/leave.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class LeaveTypeNotFoundError extends NotFoundError {
  constructor(code: string) { super(`Leave type "${code}" not found`); }
}

export class LeaveRequestNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Leave request ${id} not found`); }
}

export class InsufficientLeaveBalanceError extends ValidationError {
  constructor() { super('Insufficient leave balance and borrowing not allowed'); }
}

export class BorrowNotAllowedError extends ValidationError {
  constructor() { super('This leave type does not allow borrowing future leave'); }
}

export class HolidayConversionExistsError extends ConflictError {
  constructor() { super('Holiday already converted for this payroll cycle'); }
}

export class LeaveRescheduleNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Leave reschedule request ${id} not found`); }
}

export class LeaveShiftSwapNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Leave shift swap request ${id} not found`); }
}

export class LeaveRescheduleNotAllowedError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class LeaveShiftSwapNotAllowedError extends ValidationError {
  constructor(message: string) { super(message); }
}

export class LeaveDateOverlapError extends ConflictError {
  constructor() { super('Requested leave dates overlap with an existing approved leave'); }
}

export class EmployeeDayAlreadyBookedError extends ConflictError {
  constructor(message: string) {
    super(message);
  }
}

export class PendingLeaveRescheduleExistsError extends ConflictError {
  constructor() { super('A pending reschedule already exists for this leave request'); }
}

export class EmergencyLeaveNotEligibleError extends ValidationError {
  constructor(reason?: string) {
    super(reason ?? 'Employee is not eligible for emergency leave');
  }
}

export class LeaveRequestModificationNotAllowedError extends ValidationError {
  constructor(message: string) { super(message); }
}
