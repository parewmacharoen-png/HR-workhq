-- POL-004 Phase 4b: loss claim fields, asset gate, deferral setting support

ALTER TYPE "finance"."deposit_loss_claim_category" ADD VALUE IF NOT EXISTS 'other_company_loss';

ALTER TABLE "finance"."deposit_loss_claims"
    ADD COLUMN IF NOT EXISTS "evidence_url" TEXT,
    ADD COLUMN IF NOT EXISTS "approved_at" TIMESTAMPTZ;

CREATE TYPE "employee"."exit_case_asset_status" AS ENUM (
    'pending', 'returned', 'damaged', 'lost', 'waived'
);

CREATE TABLE "employee"."exit_case_asset_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "exit_case_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "asset_id" UUID NOT NULL,
    "status" "employee"."exit_case_asset_status" NOT NULL DEFAULT 'pending',
    "notes" TEXT,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    CONSTRAINT "exit_case_asset_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "exit_case_asset_reviews_exit_assignment_uq"
    ON "employee"."exit_case_asset_reviews" ("exit_case_id", "assignment_id");
CREATE INDEX "exit_case_asset_reviews_exit_case_id_idx"
    ON "employee"."exit_case_asset_reviews" ("exit_case_id");

ALTER TABLE "employee"."exit_case_asset_reviews"
    ADD CONSTRAINT "exit_case_asset_reviews_exit_case_id_fkey"
    FOREIGN KEY ("exit_case_id") REFERENCES "employee"."employee_exit_cases"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
