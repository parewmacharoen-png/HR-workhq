-- P0-005b Future-dated shift assignments + attendance recalculation flag

ALTER TABLE attendance.attendance_records
  ADD COLUMN IF NOT EXISTS needs_recalculation BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS attendance_records_needs_recalculation_idx
  ON attendance.attendance_records(employee_id, needs_recalculation)
  WHERE needs_recalculation = true AND deleted_at IS NULL;
