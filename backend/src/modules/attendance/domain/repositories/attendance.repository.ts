// ============================================================================
// modules/attendance/domain/repositories/attendance.repository.ts
// ============================================================================

import { AttendanceRecord } from '../entities/attendance-record.entity';

export const ATTENDANCE_REPOSITORY = Symbol('ATTENDANCE_REPOSITORY');
export const OVERTIME_REPOSITORY = Symbol('OVERTIME_REPOSITORY');

export interface AttendanceRepository {
  findById(id: string): Promise<AttendanceRecord | null>;
  findForEmployeeDate(employeeId: string, workDate: Date): Promise<AttendanceRecord | null>;
  /** Latest record with check-in and no check-out (supports night shift crossing midnight). */
  findOpenAttendanceRecord(employeeId: string): Promise<AttendanceRecord | null>;
  save(record: AttendanceRecord, actorUserId: string): Promise<void>;
  startBreak(recordId: string, at: Date): Promise<void>;
  /** Returns break duration summary, or null if no open break. */
  endOpenBreak(recordId: string, at: Date): Promise<{
    durationMinutes: number;
    breakStartAt: Date;
    breakEndAt: Date;
  } | null>;
}

export interface OvertimeDraft {
  employeeId: string;
  companyId: string;
  attendanceRecordId?: string | null;
  workDate: Date;
  otStartAt?: Date | null;
  otEndAt?: Date | null;
  otMinutes?: number | null;
  otHours: number;
  rateApplied: number;
  amount: number;
  reason?: string | null;
}

export interface OvertimeRepository {
  /** Create a pending OT record (approval-gated) and return its id. */
  createPending(draft: OvertimeDraft, actorUserId: string): Promise<string>;
  attachWorkflow(overtimeId: string, workflowInstanceId: string): Promise<void>;
}
