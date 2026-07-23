-- EMP-012b — exit case cancellation audit fields

ALTER TABLE "employee"."employee_exit_cases"
    ADD COLUMN "cancelled_at" TIMESTAMPTZ,
    ADD COLUMN "cancelled_by" UUID,
    ADD COLUMN "cancellation_reason" TEXT;
