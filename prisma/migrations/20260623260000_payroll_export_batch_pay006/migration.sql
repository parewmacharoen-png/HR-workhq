-- PAY-006 — Payroll bank transfer sheet export batches

CREATE TYPE "payroll"."payroll_export_batch_status" AS ENUM ('completed', 'cancelled');
CREATE TYPE "payroll"."payroll_export_item_status" AS ENUM ('included', 'exception', 'excluded');

CREATE TABLE "payroll"."payroll_export_batches" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "payroll_cycle_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "exported_by" UUID NOT NULL,
    "exported_at" TIMESTAMPTZ NOT NULL,
    "status" "payroll"."payroll_export_batch_status" NOT NULL DEFAULT 'completed',
    "included_count" INTEGER NOT NULL DEFAULT 0,
    "exception_count" INTEGER NOT NULL DEFAULT 0,
    "total_net_pay_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "owner_confirmed_exceptions" BOOLEAN NOT NULL DEFAULT false,
    "owner_confirmed_by" UUID,
    "owner_confirmed_at" TIMESTAMPTZ,
    "regenerated_from_batch_id" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_export_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "payroll"."payroll_export_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "batch_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_code" VARCHAR(12) NOT NULL,
    "employee_name" VARCHAR(200) NOT NULL,
    "department" VARCHAR(120),
    "team_name" VARCHAR(120),
    "bank_name" VARCHAR(120),
    "bank_account_no" VARCHAR(128),
    "bank_account_name" VARCHAR(160),
    "net_pay_amount" DECIMAL(14,2) NOT NULL,
    "payroll_components" JSONB NOT NULL,
    "export_status" "payroll"."payroll_export_item_status" NOT NULL,
    "exception_flags" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_export_items_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_export_batches_payroll_cycle_id_exported_at_idx"
    ON "payroll"."payroll_export_batches"("payroll_cycle_id", "exported_at" DESC);
CREATE INDEX "payroll_export_batches_company_id_exported_at_idx"
    ON "payroll"."payroll_export_batches"("company_id", "exported_at" DESC);
CREATE INDEX "payroll_export_items_batch_id_idx"
    ON "payroll"."payroll_export_items"("batch_id");
CREATE INDEX "payroll_export_items_employee_id_idx"
    ON "payroll"."payroll_export_items"("employee_id");

ALTER TABLE "payroll"."payroll_export_batches"
    ADD CONSTRAINT "payroll_export_batches_payroll_cycle_id_fkey"
    FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll"."payroll_cycles"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll"."payroll_export_batches"
    ADD CONSTRAINT "payroll_export_batches_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "payroll"."payroll_export_batches"
    ADD CONSTRAINT "payroll_export_batches_regenerated_from_batch_id_fkey"
    FOREIGN KEY ("regenerated_from_batch_id") REFERENCES "payroll"."payroll_export_batches"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "payroll"."payroll_export_items"
    ADD CONSTRAINT "payroll_export_items_batch_id_fkey"
    FOREIGN KEY ("batch_id") REFERENCES "payroll"."payroll_export_batches"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "payroll"."payroll_export_items"
    ADD CONSTRAINT "payroll_export_items_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
