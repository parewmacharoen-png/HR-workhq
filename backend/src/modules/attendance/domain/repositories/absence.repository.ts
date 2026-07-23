// ============================================================================
// modules/attendance/domain/repositories/absence.repository.ts
// ============================================================================

import { AbsenceRecord, AbsenceRecordStatus } from '../entities/absence-record.entity';

export const ABSENCE_REPOSITORY = Symbol('ABSENCE_REPOSITORY');

export interface AbsenceListFilter {
  companyId: string;
  status?: AbsenceRecordStatus;
  from?: Date;
  to?: Date;
  employeeId?: string;
}

export interface AbsenceListRow {
  record: AbsenceRecord;
  employeeName: string;
  employeePosition: string | null;
}

export interface AbsenceRepository {
  findById(id: string): Promise<AbsenceRecord | null>;
  findForEmployeeDate(employeeId: string, companyId: string, workDate: Date): Promise<AbsenceRecord | null>;
  list(filter: AbsenceListFilter): Promise<AbsenceListRow[]>;
  save(record: AbsenceRecord): Promise<void>;
}
