-- EMP-011 — Employee awards & service milestone recognition types

ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'BEST_ATTENDANCE';
ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'BEST_PERFORMANCE';
ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'TOP_RECRUITER';
ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'TOP_MARKETING';
ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'SERVICE_AWARD_1_YEAR';
ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'SERVICE_AWARD_3_YEAR';
ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'SERVICE_AWARD_5_YEAR';
ALTER TYPE "employee"."employee_recognition_type" ADD VALUE IF NOT EXISTS 'SERVICE_AWARD_10_YEAR';

ALTER TABLE "employee"."employee_recognitions"
  ADD COLUMN IF NOT EXISTS "award_month" DATE,
  ADD COLUMN IF NOT EXISTS "gift_or_reward" TEXT,
  ADD COLUMN IF NOT EXISTS "given_by" UUID;

CREATE INDEX IF NOT EXISTS "employee_recognitions_company_id_award_month_idx"
  ON "employee"."employee_recognitions" ("company_id", "award_month");
