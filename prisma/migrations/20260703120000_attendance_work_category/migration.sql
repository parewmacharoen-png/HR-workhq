-- Per-day office/WFH on attendance (defaults to office for existing rows).
ALTER TABLE "attendance"."attendance_records"
  ADD COLUMN IF NOT EXISTS "work_category" VARCHAR(20) NOT NULL DEFAULT 'office';

UPDATE "attendance"."attendance_records"
  SET "work_category" = 'office'
  WHERE "work_category" IS NULL OR "work_category" = '';
