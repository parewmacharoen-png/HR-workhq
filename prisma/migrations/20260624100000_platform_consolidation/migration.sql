-- Platform Consolidation Sprint PART A — employee positions, KPI rules, integration fields, documents, announcements, doc queue

-- Employee position framework FKs
ALTER TABLE "employee"."employees"
    ADD COLUMN IF NOT EXISTS "position_family_id" UUID,
    ADD COLUMN IF NOT EXISTS "position_level_id" UUID,
    ADD COLUMN IF NOT EXISTS "position_definition_id" UUID;

CREATE INDEX IF NOT EXISTS "employees_position_family_id_idx"
    ON "employee"."employees"("position_family_id");
CREATE INDEX IF NOT EXISTS "employees_position_level_id_idx"
    ON "employee"."employees"("position_level_id");
CREATE INDEX IF NOT EXISTS "employees_position_definition_id_idx"
    ON "employee"."employees"("position_definition_id");

ALTER TABLE "employee"."employees"
    ADD CONSTRAINT "employees_position_family_id_fkey"
    FOREIGN KEY ("position_family_id") REFERENCES "organization"."position_families"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee"."employees"
    ADD CONSTRAINT "employees_position_level_id_fkey"
    FOREIGN KEY ("position_level_id") REFERENCES "organization"."position_levels"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "employee"."employees"
    ADD CONSTRAINT "employees_position_definition_id_fkey"
    FOREIGN KEY ("position_definition_id") REFERENCES "organization"."position_definitions"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- KPI position assignment rules
CREATE TABLE IF NOT EXISTS "performance"."kpi_position_assignment_rules" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID,
    "position_definition_id" UUID NOT NULL,
    "kpi_template_id" UUID NOT NULL,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "kpi_position_assignment_rules_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "kpi_position_assignment_rules_position_definition_id_active_idx"
    ON "performance"."kpi_position_assignment_rules"("position_definition_id", "active");
CREATE INDEX IF NOT EXISTS "kpi_position_assignment_rules_company_id_active_idx"
    ON "performance"."kpi_position_assignment_rules"("company_id", "active");

ALTER TABLE "performance"."kpi_position_assignment_rules"
    ADD CONSTRAINT "kpi_position_assignment_rules_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "performance"."kpi_position_assignment_rules"
    ADD CONSTRAINT "kpi_position_assignment_rules_position_definition_id_fkey"
    FOREIGN KEY ("position_definition_id") REFERENCES "organization"."position_definitions"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "performance"."kpi_position_assignment_rules"
    ADD CONSTRAINT "kpi_position_assignment_rules_kpi_template_id_fkey"
    FOREIGN KEY ("kpi_template_id") REFERENCES "performance"."kpi_templates"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- Request integration tracking
ALTER TABLE "workflow"."request_instances"
    ADD COLUMN IF NOT EXISTS "integration_status" VARCHAR(40),
    ADD COLUMN IF NOT EXISTS "integration_entity_type" VARCHAR(60),
    ADD COLUMN IF NOT EXISTS "integration_entity_id" UUID,
    ADD COLUMN IF NOT EXISTS "integration_error" TEXT;

-- Employee document lifecycle
ALTER TABLE "employee"."employee_documents"
    ADD COLUMN IF NOT EXISTS "source_type" VARCHAR(40) NOT NULL DEFAULT 'employee_upload',
    ADD COLUMN IF NOT EXISTS "expires_at" DATE,
    ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ;

-- Announcement lifecycle
ALTER TABLE "telegram"."announcements"
    ADD COLUMN IF NOT EXISTS "announcement_type" VARCHAR(40) NOT NULL DEFAULT 'general',
    ADD COLUMN IF NOT EXISTS "status" VARCHAR(20) NOT NULL DEFAULT 'draft',
    ADD COLUMN IF NOT EXISTS "archived_at" TIMESTAMPTZ;

ALTER TABLE "telegram"."announcement_deliveries"
    ADD COLUMN IF NOT EXISTS "opened_at" TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS "acknowledged_at" TIMESTAMPTZ;

-- Document generation queue (workflow-approved document requests)
CREATE TABLE IF NOT EXISTS "workflow"."document_generation_queue" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "request_instance_id" UUID,
    "document_type" VARCHAR(60) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'pending',
    "payload" JSONB,
    "generated_file_key" VARCHAR(512),
    "error_message" TEXT,
    "completed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    CONSTRAINT "document_generation_queue_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "document_generation_queue_company_id_status_idx"
    ON "workflow"."document_generation_queue"("company_id", "status");
CREATE INDEX IF NOT EXISTS "document_generation_queue_employee_id_idx"
    ON "workflow"."document_generation_queue"("employee_id");
CREATE INDEX IF NOT EXISTS "document_generation_queue_request_instance_id_idx"
    ON "workflow"."document_generation_queue"("request_instance_id");

ALTER TABLE "workflow"."document_generation_queue"
    ADD CONSTRAINT "document_generation_queue_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow"."document_generation_queue"
    ADD CONSTRAINT "document_generation_queue_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "workflow"."document_generation_queue"
    ADD CONSTRAINT "document_generation_queue_request_instance_id_fkey"
    FOREIGN KEY ("request_instance_id") REFERENCES "workflow"."request_instances"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
