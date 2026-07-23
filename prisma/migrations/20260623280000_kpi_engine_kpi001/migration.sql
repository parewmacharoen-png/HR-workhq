-- KPI-001 — Performance KPI engine foundation

CREATE TYPE "performance"."kpi_template_status" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "performance"."kpi_target_type" AS ENUM ('number', 'percent', 'boolean', 'rating', 'text');
CREATE TYPE "performance"."kpi_scoring_method" AS ENUM ('manual', 'formula', 'imported');
CREATE TYPE "performance"."kpi_cycle_status" AS ENUM ('draft', 'active', 'scoring', 'finalized', 'cancelled');
CREATE TYPE "performance"."kpi_assignment_status" AS ENUM ('pending', 'in_progress', 'submitted', 'reviewed', 'finalized');

CREATE TABLE "performance"."kpi_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "applicable_role" VARCHAR(100),
    "applicable_department" VARCHAR(100),
    "applicable_team_id" UUID,
    "status" "performance"."kpi_template_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "kpi_templates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."kpi_metrics" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "template_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(500),
    "weight" DECIMAL(8,4) NOT NULL,
    "target_type" "performance"."kpi_target_type" NOT NULL,
    "target_value" VARCHAR(200),
    "scoring_method" "performance"."kpi_scoring_method" NOT NULL DEFAULT 'manual',
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "kpi_metrics_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."kpi_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "status" "performance"."kpi_cycle_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "kpi_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."kpi_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "reviewer_id" UUID,
    "status" "performance"."kpi_assignment_status" NOT NULL DEFAULT 'pending',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "kpi_assignments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."kpi_scores" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "assignment_id" UUID NOT NULL,
    "total_score" DECIMAL(8,4),
    "grade" VARCHAR(2),
    "reviewer_comment" VARCHAR(2000),
    "employee_comment" VARCHAR(2000),
    "finalized_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kpi_scores_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."kpi_score_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "score_id" UUID NOT NULL,
    "metric_id" UUID NOT NULL,
    "raw_value" VARCHAR(500),
    "score" DECIMAL(8,4),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "kpi_score_items_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "kpi_assignments_cycle_id_employee_id_template_id_key"
    ON "performance"."kpi_assignments"("cycle_id", "employee_id", "template_id");
CREATE UNIQUE INDEX "kpi_scores_assignment_id_key" ON "performance"."kpi_scores"("assignment_id");
CREATE UNIQUE INDEX "kpi_score_items_score_id_metric_id_key"
    ON "performance"."kpi_score_items"("score_id", "metric_id");

CREATE INDEX "kpi_templates_company_id_status_idx" ON "performance"."kpi_templates"("company_id", "status");
CREATE INDEX "kpi_metrics_template_id_sort_order_idx" ON "performance"."kpi_metrics"("template_id", "sort_order");
CREATE INDEX "kpi_cycles_company_id_status_idx" ON "performance"."kpi_cycles"("company_id", "status");
CREATE INDEX "kpi_assignments_employee_id_status_idx" ON "performance"."kpi_assignments"("employee_id", "status");
CREATE INDEX "kpi_assignments_cycle_id_status_idx" ON "performance"."kpi_assignments"("cycle_id", "status");

ALTER TABLE "performance"."kpi_templates"
    ADD CONSTRAINT "kpi_templates_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "performance"."kpi_metrics"
    ADD CONSTRAINT "kpi_metrics_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "performance"."kpi_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."kpi_cycles"
    ADD CONSTRAINT "kpi_cycles_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."kpi_assignments"
    ADD CONSTRAINT "kpi_assignments_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "performance"."kpi_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."kpi_assignments"
    ADD CONSTRAINT "kpi_assignments_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."kpi_assignments"
    ADD CONSTRAINT "kpi_assignments_template_id_fkey"
    FOREIGN KEY ("template_id") REFERENCES "performance"."kpi_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."kpi_scores"
    ADD CONSTRAINT "kpi_scores_assignment_id_fkey"
    FOREIGN KEY ("assignment_id") REFERENCES "performance"."kpi_assignments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."kpi_score_items"
    ADD CONSTRAINT "kpi_score_items_score_id_fkey"
    FOREIGN KEY ("score_id") REFERENCES "performance"."kpi_scores"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."kpi_score_items"
    ADD CONSTRAINT "kpi_score_items_metric_id_fkey"
    FOREIGN KEY ("metric_id") REFERENCES "performance"."kpi_metrics"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
