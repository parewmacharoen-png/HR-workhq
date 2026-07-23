// ============================================================================
// modules/attendance/domain/errors/attendance.errors.ts
// ============================================================================

import {
  ConflictError, NotFoundError, ValidationError,
} from '../../../../shared/kernel/domain-error';

export class AttendanceRecordNotFoundError extends NotFoundError {
  constructor(id: string) { super(`Attendance record ${id} not found`); }
}

export class OpenShiftNotClosedError extends ConflictError {
  constructor(workDateIso: string) {
    super(`ยังไม่ได้ออกงานจากวันที่ ${workDateIso} — กรุณากดออกงานก่อนเข้างานใหม่`);
  }
}

export class AlreadyCheckedInError extends ConflictError {
  constructor() { super('Already checked in for today'); }
}

export class NotCheckedInError extends ValidationError {
  constructor(message = 'ยังไม่ได้เข้างาน — ไม่สามารถออกงานได้') {
    super(message);
  }
}

export class AlreadyCheckedOutError extends ConflictError {
  constructor() { super('Already checked out for today'); }
}

export class BreakNotStartedError extends ValidationError {
  constructor() { super('No open break to end'); }
}
