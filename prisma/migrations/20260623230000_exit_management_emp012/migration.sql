-- EMP-012 — Exit management & employee lifecycle completion

CREATE TYPE "employee"."exit_case_type" AS ENUM ('resignation', 'termination', 'absconding');
CREATE TYPE "employee"."exit_case_source_type" AS ENUM ('manual', 'probation_review', 'disciplinary_action');

ALTER TABLE "employee"."employee_exit_cases"
    ADD COLUMN "exit_type" "employee"."exit_case_type",
    ADD COLUMN "source_type" "employee"."exit_case_source_type" NOT NULL DEFAULT 'manual',
    ADD COLUMN "source_id" UUID;

UPDATE "employee"."employee_exit_cases"
SET "exit_type" = CASE
    WHEN "exit_reason" IN ('proper_resignation', 'constructive_resignation') THEN 'resignation'::"employee"."exit_case_type"
    WHEN "exit_reason" = 'absconding' THEN 'absconding'::"employee"."exit_case_type"
    ELSE 'termination'::"employee"."exit_case_type"
END
WHERE "exit_type" IS NULL;

ALTER TABLE "employee"."employee_exit_cases"
    ALTER COLUMN "exit_type" SET NOT NULL;

CREATE INDEX "employee_exit_cases_company_effective_date_idx"
    ON "employee"."employee_exit_cases" ("company_id", "effective_termination_date");

CREATE TABLE "employee"."exit_checklist_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exit_case_id" UUID NOT NULL,
    "item_key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completed_by" UUID,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "exit_checklist_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exit_checklist_items_exit_case_item_key_uq"
    ON "employee"."exit_checklist_items" ("exit_case_id", "item_key");
CREATE INDEX "exit_checklist_items_exit_case_id_idx"
    ON "employee"."exit_checklist_items" ("exit_case_id");

ALTER TABLE "employee"."exit_checklist_items"
    ADD CONSTRAINT "exit_checklist_items_exit_case_id_fkey"
    FOREIGN KEY ("exit_case_id") REFERENCES "employee"."employee_exit_cases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
