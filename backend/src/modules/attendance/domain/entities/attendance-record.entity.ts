// ============================================================================
// modules/attendance/domain/entities/attendance-record.entity.ts
// ============================================================================

import {
  AlreadyCheckedInError, AlreadyCheckedOutError, NotCheckedInError,
} from '../errors/attendance.errors';

export type RecordStatus = 'present' | 'absent' | 'incomplete' | 'corrected';
export type RecordSource = 'telegram' | 'web' | 'correction';
export type WorkCategory = 'office' | 'wfh';

export interface AttendanceRecordProps {
  id: string;
  employeeId: string;
  companyId: string;
  workDate: Date;
  workCategory: WorkCategory;
  shiftId: string | null;
  shiftStartAt: Date | null;
  shiftEndAt: Date | null;
  checkInAt: Date | null;
  checkOutAt: Date | null;
  breakStartAt: Date | null;
  breakEndAt: Date | null;
  lateMinutes: number;
  roundedLateHours: number;
  lateDeduction: number;
  workedMinutes: number;
  status: RecordStatus;
  source: RecordSource;
  deletedAt: Date | null;
}

export class AttendanceRecord {
  private constructor(private props: AttendanceRecordProps) {}

  static rehydrate(props: AttendanceRecordProps): AttendanceRecord {
    return new AttendanceRecord(props);
  }

  static open(input: {
    id: string;
    employeeId: string;
    companyId: string;
    workDate: Date;
    source?: RecordSource;
    workCategory?: WorkCategory;
  }): AttendanceRecord {
    return new AttendanceRecord({
      id: input.id,
      employeeId: input.employeeId,
      companyId: input.companyId,
      workDate: input.workDate,
      workCategory: input.workCategory ?? 'office',
      shiftId: null,
      shiftStartAt: null,
      shiftEndAt: null,
      checkInAt: null,
      checkOutAt: null,
      breakStartAt: null,
      breakEndAt: null,
      lateMinutes: 0,
      roundedLateHours: 0,
      lateDeduction: 0,
      workedMinutes: 0,
      status: 'incomplete',
      source: input.source ?? 'telegram',
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get companyId(): string { return this.props.companyId; }
  get workCategory(): WorkCategory { return this.props.workCategory; }
  get checkInAt(): Date | null { return this.props.checkInAt; }
  get checkOutAt(): Date | null { return this.props.checkOutAt; }
  get shiftStartAt(): Date | null { return this.props.shiftStartAt; }
  get shiftEndAt(): Date | null { return this.props.shiftEndAt; }

  setWorkCategory(category: WorkCategory): void {
    this.props.workCategory = category;
  }

  checkIn(
    at: Date,
    shift: { shiftId: string | null; shiftStartAt: Date; shiftEndAt: Date },
    late: { lateMinutes: number; roundedLateHours: number; lateDeduction: number },
    workCategory?: WorkCategory,
  ): void {
    if (this.props.checkInAt) throw new AlreadyCheckedInError();
    this.props.checkInAt = at;
    this.props.shiftId = shift.shiftId;
    this.props.shiftStartAt = shift.shiftStartAt;
    this.props.shiftEndAt = shift.shiftEndAt;
    this.props.lateMinutes = late.lateMinutes;
    this.props.roundedLateHours = late.roundedLateHours;
    this.props.lateDeduction = late.lateDeduction;
    if (workCategory) this.props.workCategory = workCategory;
    this.props.status = 'present';
  }

  checkOut(at: Date, workedMinutes: number): void {
    if (!this.props.checkInAt) throw new NotCheckedInError();
    if (this.props.checkOutAt) throw new AlreadyCheckedOutError();
    this.props.checkOutAt = at;
    this.props.workedMinutes = workedMinutes;
  }

  setBreakStart(at: Date): void {
    this.props.breakStartAt = at;
  }

  setBreakEnd(at: Date): void {
    this.props.breakEndAt = at;
  }

  markCorrected(): void {
    this.props.status = 'corrected';
  }

  toPersistence(): AttendanceRecordProps {
    return { ...this.props };
  }
}
