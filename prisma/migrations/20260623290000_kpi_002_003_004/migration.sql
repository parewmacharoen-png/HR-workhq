-- KPI-002 / KPI-003 / KPI-004 — Dynamic KPI builder, performance review, position framework

CREATE TYPE "organization"."framework_entity_status" AS ENUM ('draft', 'active', 'archived');

CREATE TABLE "organization"."position_families" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "status" "organization"."framework_entity_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_id" UUID,
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "position_families_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization"."position_levels" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "family_id" UUID,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "rank_order" INTEGER NOT NULL DEFAULT 0,
    "description" VARCHAR(1000),
    "status" "organization"."framework_entity_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_id" UUID,
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "position_levels_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization"."position_definitions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "family_id" UUID,
    "level_id" UUID,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "status" "organization"."framework_entity_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_id" UUID,
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "position_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization"."career_paths" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "status" "organization"."framework_entity_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_id" UUID,
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "career_paths_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization"."career_path_steps" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "career_path_id" UUID NOT NULL,
    "position_definition_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL DEFAULT 0,
    "notes" VARCHAR(500),
    CONSTRAINT "career_path_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "organization"."promotion_paths" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "code" VARCHAR(40) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "description" VARCHAR(1000),
    "from_position_id" UUID NOT NULL,
    "to_position_id" UUID NOT NULL,
    "requirements" VARCHAR(2000),
    "status" "organization"."framework_entity_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_id" UUID,
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "promotion_paths_pkey" PRIMARY KEY ("id")
);

ALTER TYPE "performance"."kpi_scoring_method" ADD VALUE IF NOT EXISTS 'system';
ALTER TYPE "performance"."kpi_scoring_method" ADD VALUE IF NOT EXISTS 'api';

ALTER TABLE "performance"."kpi_templates"
    ADD COLUMN IF NOT EXISTS "position_definition_id" UUID,
    ADD COLUMN IF NOT EXISTS "version" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "root_id" UUID,
    ADD COLUMN IF NOT EXISTS "source_id" UUID;

ALTER TABLE "performance"."kpi_metrics"
    ADD COLUMN IF NOT EXISTS "formula_expression" VARCHAR(1000),
    ADD COLUMN IF NOT EXISTS "system_source_key" VARCHAR(200),
    ADD COLUMN IF NOT EXISTS "api_endpoint" VARCHAR(500),
    ADD COLUMN IF NOT EXISTS "api_field_path" VARCHAR(200);

CREATE TYPE "performance"."performance_config_status" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "performance"."performance_review_status" AS ENUM ('draft', 'in_progress', 'submitted', 'reviewed', 'finalized', 'cancelled');

CREATE TABLE "performance"."performance_weight_profiles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "kpi_weight" DECIMAL(8,4) NOT NULL,
    "leader_review_weight" DECIMAL(8,4) NOT NULL,
    "self_review_weight" DECIMAL(8,4) NOT NULL,
    "feedback360_weight" DECIMAL(8,4) NOT NULL,
    "is_default" BOOLEAN NOT NULL DEFAULT false,
    "status" "performance"."performance_config_status" NOT NULL DEFAULT 'draft',
    "version" INTEGER NOT NULL DEFAULT 1,
    "root_id" UUID,
    "source_id" UUID,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "performance_weight_profiles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."performance_review_cycles" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "period_start" DATE NOT NULL,
    "period_end" DATE NOT NULL,
    "weight_profile_id" UUID NOT NULL,
    "status" "performance"."kpi_cycle_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,
    CONSTRAINT "performance_review_cycles_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."performance_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cycle_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "kpi_assignment_id" UUID,
    "reviewer_id" UUID,
    "status" "performance"."performance_review_status" NOT NULL DEFAULT 'draft',
    "kpi_score" DECIMAL(8,4),
    "leader_review_score" DECIMAL(8,4),
    "self_review_score" DECIMAL(8,4),
    "feedback360_score" DECIMAL(8,4),
    "final_score" DECIMAL(8,4),
    "grade" VARCHAR(2),
    "leader_comment" VARCHAR(2000),
    "self_comment" VARCHAR(2000),
    "finalized_at" TIMESTAMPTZ,
    "created_by" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,
    CONSTRAINT "performance_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "performance"."performance_review_360_feedback" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "review_id" UUID NOT NULL,
    "reviewer_id" UUID NOT NULL,
    "score" DECIMAL(8,4) NOT NULL,
    "comment" VARCHAR(2000),
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "performance_review_360_feedback_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "career_path_steps_career_path_id_step_order_key"
    ON "organization"."career_path_steps"("career_path_id", "step_order");
CREATE UNIQUE INDEX "performance_reviews_cycle_id_employee_id_key"
    ON "performance"."performance_reviews"("cycle_id", "employee_id");
CREATE UNIQUE INDEX "performance_review_360_feedback_review_id_reviewer_id_key"
    ON "performance"."performance_review_360_feedback"("review_id", "reviewer_id");

CREATE INDEX "position_families_company_id_status_idx" ON "organization"."position_families"("company_id", "status");
CREATE INDEX "position_levels_company_id_status_idx" ON "organization"."position_levels"("company_id", "status");
CREATE INDEX "position_definitions_company_id_status_idx" ON "organization"."position_definitions"("company_id", "status");
CREATE INDEX "kpi_templates_position_definition_id_status_idx"
    ON "performance"."kpi_templates"("position_definition_id", "status");

ALTER TABLE "organization"."position_families"
    ADD CONSTRAINT "position_families_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."position_levels"
    ADD CONSTRAINT "position_levels_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."position_levels"
    ADD CONSTRAINT "position_levels_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "organization"."position_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization"."position_definitions"
    ADD CONSTRAINT "position_definitions_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."position_definitions"
    ADD CONSTRAINT "position_definitions_family_id_fkey"
    FOREIGN KEY ("family_id") REFERENCES "organization"."position_families"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization"."position_definitions"
    ADD CONSTRAINT "position_definitions_level_id_fkey"
    FOREIGN KEY ("level_id") REFERENCES "organization"."position_levels"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "organization"."career_paths"
    ADD CONSTRAINT "career_paths_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."career_path_steps"
    ADD CONSTRAINT "career_path_steps_career_path_id_fkey"
    FOREIGN KEY ("career_path_id") REFERENCES "organization"."career_paths"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."career_path_steps"
    ADD CONSTRAINT "career_path_steps_position_definition_id_fkey"
    FOREIGN KEY ("position_definition_id") REFERENCES "organization"."position_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."promotion_paths"
    ADD CONSTRAINT "promotion_paths_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."promotion_paths"
    ADD CONSTRAINT "promotion_paths_from_position_id_fkey"
    FOREIGN KEY ("from_position_id") REFERENCES "organization"."position_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "organization"."promotion_paths"
    ADD CONSTRAINT "promotion_paths_to_position_id_fkey"
    FOREIGN KEY ("to_position_id") REFERENCES "organization"."position_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "performance"."kpi_templates"
    ADD CONSTRAINT "kpi_templates_position_definition_id_fkey"
    FOREIGN KEY ("position_definition_id") REFERENCES "organization"."position_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance"."performance_weight_profiles"
    ADD CONSTRAINT "performance_weight_profiles_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."performance_review_cycles"
    ADD CONSTRAINT "performance_review_cycles_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."performance_review_cycles"
    ADD CONSTRAINT "performance_review_cycles_weight_profile_id_fkey"
    FOREIGN KEY ("weight_profile_id") REFERENCES "performance"."performance_weight_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."performance_reviews"
    ADD CONSTRAINT "performance_reviews_cycle_id_fkey"
    FOREIGN KEY ("cycle_id") REFERENCES "performance"."performance_review_cycles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."performance_reviews"
    ADD CONSTRAINT "performance_reviews_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."performance_reviews"
    ADD CONSTRAINT "performance_reviews_kpi_assignment_id_fkey"
    FOREIGN KEY ("kpi_assignment_id") REFERENCES "performance"."kpi_assignments"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance"."performance_review_360_feedback"
    ADD CONSTRAINT "performance_review_360_feedback_review_id_fkey"
    FOREIGN KEY ("review_id") REFERENCES "performance"."performance_reviews"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
