-- POL-025: disciplinary action foundation

CREATE TYPE "employee"."disciplinary_action_type" AS ENUM (
    'verbal_warning', 'warning_1', 'warning_2', 'termination'
);

CREATE TABLE "employee"."disciplinary_actions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "action_type" "employee"."disciplinary_action_type" NOT NULL,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "evidence_url" TEXT,
    "termination_reason" TEXT,
    "termination_note" TEXT,
    "issued_by" UUID NOT NULL,
    "acknowledged_by" UUID,
    "acknowledged_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "disciplinary_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "disciplinary_actions_employee_created_idx"
    ON "employee"."disciplinary_actions" ("employee_id", "created_at");
CREATE INDEX "disciplinary_actions_company_id_idx"
    ON "employee"."disciplinary_actions" ("company_id");

ALTER TABLE "employee"."disciplinary_actions"
    ADD CONSTRAINT "disciplinary_actions_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee"."disciplinary_actions"
    ADD CONSTRAINT "disciplinary_actions_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
