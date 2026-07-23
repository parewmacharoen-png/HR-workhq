-- POL-004 Phase 4a: employee exit cases + deposit loss claims

CREATE TYPE "employee"."exit_reason" AS ENUM (
  'proper_resignation', 'absconding', 'gross_misconduct', 'performance_failure', 'constructive_resignation'
);
CREATE TYPE "employee"."exit_case_status" AS ENUM (
  'draft', 'pending_leader_review', 'pending_owner_review', 'pending_settlement', 'settled', 'closed', 'cancelled'
);
CREATE TYPE "employee"."exit_department_route" AS ENUM ('marketing', 'admin');
CREATE TYPE "finance"."deposit_loss_claim_category" AS ENUM (
  'property_damage', 'lost_equipment', 'cash_shortage', 'other'
);
CREATE TYPE "finance"."deposit_loss_claim_status" AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE "finance"."deposit_refund_type" AS ENUM ('full', 'partial', 'forfeit');

ALTER TYPE "workflow"."entity_type" ADD VALUE IF NOT EXISTS 'employee_exit';

CREATE TABLE "employee"."employee_exit_cases" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "exit_reason" "employee"."exit_reason" NOT NULL,
    "status" "employee"."exit_case_status" NOT NULL DEFAULT 'draft',
    "department_route" "employee"."exit_department_route" NOT NULL,
    "effective_termination_date" DATE NOT NULL,
    "assets_returned" BOOLEAN NOT NULL DEFAULT false,
    "debts_cleared" BOOLEAN NOT NULL DEFAULT false,
    "final_payroll_built" BOOLEAN NOT NULL DEFAULT false,
    "access_revoked" BOOLEAN NOT NULL DEFAULT false,
    "deposit_balance_at_exit" DECIMAL(14,2),
    "loss_claim_total" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "refund_amount" DECIMAL(14,2),
    "forfeit_amount" DECIMAL(14,2),
    "legal_review_required" BOOLEAN NOT NULL DEFAULT false,
    "deposit_refund_id" UUID,
    "leader_reviewed_by" UUID,
    "leader_reviewed_at" TIMESTAMPTZ,
    "leader_notes" TEXT,
    "owner_reviewed_by" UUID,
    "owner_reviewed_at" TIMESTAMPTZ,
    "owner_notes" TEXT,
    "notes" TEXT,
    "initiated_by" UUID NOT NULL,
    "settled_at" TIMESTAMPTZ,
    "closed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "employee_exit_cases_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "employee_exit_cases_employee_company_status_idx"
    ON "employee"."employee_exit_cases" ("employee_id", "company_id", "status");
CREATE INDEX "employee_exit_cases_company_status_idx"
    ON "employee"."employee_exit_cases" ("company_id", "status");

CREATE UNIQUE INDEX "employee_exit_cases_one_open_per_employee_company_uq"
    ON "employee"."employee_exit_cases" ("employee_id", "company_id")
    WHERE "deleted_at" IS NULL
      AND "status" NOT IN ('closed', 'cancelled');

ALTER TABLE "employee"."employee_exit_cases"
    ADD CONSTRAINT "employee_exit_cases_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee"."employee_exit_cases"
    ADD CONSTRAINT "employee_exit_cases_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "finance"."deposit_refunds"
    ADD COLUMN IF NOT EXISTS "exit_case_id" UUID,
    ADD COLUMN IF NOT EXISTS "refund_type" "finance"."deposit_refund_type",
    ADD COLUMN IF NOT EXISTS "forfeit_reason" TEXT;

CREATE INDEX IF NOT EXISTS "deposit_refunds_exit_case_id_idx"
    ON "finance"."deposit_refunds" ("exit_case_id");

CREATE TABLE "finance"."deposit_loss_claims" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exit_case_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "category" "finance"."deposit_loss_claim_category" NOT NULL,
    "description" TEXT NOT NULL,
    "asset_id" UUID,
    "authorized_by" UUID,
    "status" "finance"."deposit_loss_claim_status" NOT NULL DEFAULT 'pending',
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "deposit_loss_claims_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "deposit_loss_claims_exit_case_id_idx" ON "finance"."deposit_loss_claims" ("exit_case_id");
CREATE INDEX "deposit_loss_claims_employee_id_idx" ON "finance"."deposit_loss_claims" ("employee_id");

ALTER TABLE "finance"."deposit_loss_claims"
    ADD CONSTRAINT "deposit_loss_claims_exit_case_id_fkey"
    FOREIGN KEY ("exit_case_id") REFERENCES "employee"."employee_exit_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance"."deposit_loss_claims"
    ADD CONSTRAINT "deposit_loss_claims_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "finance"."deposit_loss_claims"
    ADD CONSTRAINT "deposit_loss_claims_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee"."employee_exit_cases"
    ADD CONSTRAINT "employee_exit_cases_deposit_refund_id_fkey"
    FOREIGN KEY ("deposit_refund_id") REFERENCES "finance"."deposit_refunds"("id") ON DELETE SET NULL ON UPDATE CASCADE;
