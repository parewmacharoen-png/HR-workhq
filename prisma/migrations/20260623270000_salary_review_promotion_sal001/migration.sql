-- SAL-001 — Salary review & promotion workflow

CREATE TYPE "performance"."compensation_review_status" AS ENUM (
  'draft',
  'pending_approval',
  'approved',
  'rejected',
  'applied'
);

CREATE TABLE "performance"."salary_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "current_salary" DECIMAL(14,2) NOT NULL,
    "proposed_salary" DECIMAL(14,2) NOT NULL,
    "increase_amount" DECIMAL(14,2) NOT NULL,
    "increase_percent" DECIMAL(8,4) NOT NULL,
    "reason" VARCHAR(500),
    "effective_date" DATE NOT NULL,
    "status" "performance"."compensation_review_status" NOT NULL DEFAULT 'draft',
    "requested_by" UUID,
    "approved_by" UUID,
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ,
    "applied_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,

    CONSTRAINT "salary_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."promotion_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "current_position" VARCHAR(120),
    "proposed_position" VARCHAR(120) NOT NULL,
    "reason" VARCHAR(500),
    "effective_date" DATE NOT NULL,
    "status" "performance"."compensation_review_status" NOT NULL DEFAULT 'draft',
    "requested_by" UUID,
    "approved_by" UUID,
    "rejected_by" UUID,
    "rejected_at" TIMESTAMPTZ,
    "applied_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,

    CONSTRAINT "promotion_reviews_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "salary_reviews_employee_id_status_idx"
    ON "performance"."salary_reviews"("employee_id", "status");
CREATE INDEX "salary_reviews_company_id_status_idx"
    ON "performance"."salary_reviews"("company_id", "status");
CREATE INDEX "salary_reviews_company_id_effective_date_idx"
    ON "performance"."salary_reviews"("company_id", "effective_date");

CREATE INDEX "promotion_reviews_employee_id_status_idx"
    ON "performance"."promotion_reviews"("employee_id", "status");
CREATE INDEX "promotion_reviews_company_id_status_idx"
    ON "performance"."promotion_reviews"("company_id", "status");
CREATE INDEX "promotion_reviews_company_id_effective_date_idx"
    ON "performance"."promotion_reviews"("company_id", "effective_date");

ALTER TABLE "performance"."salary_reviews"
    ADD CONSTRAINT "salary_reviews_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."salary_reviews"
    ADD CONSTRAINT "salary_reviews_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."promotion_reviews"
    ADD CONSTRAINT "promotion_reviews_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."promotion_reviews"
    ADD CONSTRAINT "promotion_reviews_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
