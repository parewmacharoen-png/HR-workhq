-- Break deduction fields on attendance + payroll item types
ALTER TABLE "attendance"."attendance_records"
  ADD COLUMN IF NOT EXISTS "total_break_minutes" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "break_deduction" DECIMAL(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "break_penalty_tier" TEXT;

ALTER TYPE "payroll"."item_type" ADD VALUE IF NOT EXISTS 'break_deduction';
ALTER TYPE "payroll"."item_type" ADD VALUE IF NOT EXISTS 'consecutive_leave_deduction';
