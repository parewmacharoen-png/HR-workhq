-- POL-003 Phase 3b: absence_deduction payroll item + absence_record source ref

ALTER TYPE "payroll"."item_type" ADD VALUE IF NOT EXISTS 'absence_deduction';
ALTER TYPE "payroll"."source_ref_type" ADD VALUE IF NOT EXISTS 'absence_record';
