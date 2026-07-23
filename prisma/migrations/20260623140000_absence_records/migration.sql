-- POL-003 Phase 3a: absence_records table

CREATE TYPE "attendance"."absence_record_status" AS ENUM ('flagged', 'approved', 'waived', 'disputed');
CREATE TYPE "attendance"."absence_role_level" AS ENUM ('employee', 'sub_leader', 'big_leader');

CREATE TABLE "attendance"."absence_records" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "work_date" DATE NOT NULL,
    "status" "attendance"."absence_record_status" NOT NULL DEFAULT 'flagged',
    "role_level_snapshot" "attendance"."absence_role_level",
    "position_snapshot" VARCHAR(120),
    "penalty_amount" DECIMAL(14,2),
    "contact_attempted_at" TIMESTAMPTZ,
    "contact_notes" TEXT,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "waived_by" UUID,
    "waived_at" TIMESTAMPTZ,
    "waive_reason" TEXT,
    "dispute_reason" TEXT,
    "disputed_at" TIMESTAMPTZ,
    "resolved_by" UUID,
    "resolved_at" TIMESTAMPTZ,
    "payroll_item_id" UUID,
    "flagged_reason" VARCHAR(120) NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,

    CONSTRAINT "absence_records_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "absence_records_employee_company_date_uq"
    ON "attendance"."absence_records" ("employee_id", "company_id", "work_date")
    WHERE "deleted_at" IS NULL;

CREATE INDEX "absence_records_company_id_work_date_status_idx"
    ON "attendance"."absence_records" ("company_id", "work_date", "status");

ALTER TABLE "attendance"."absence_records"
    ADD CONSTRAINT "absence_records_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance"."absence_records"
    ADD CONSTRAINT "absence_records_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
