-- Commission declarations (multi-assignment onboarding)

CREATE TYPE "commission"."commission_declaration_status" AS ENUM (
  'draft', 'submitted', 'hr_review', 'approved', 'rejected'
);

CREATE TYPE "commission"."commission_declaration_assignment_type" AS ENUM (
  'primary', 'secondary'
);

CREATE TYPE "commission"."commission_declaration_method" AS ENUM (
  'team_pool', 'big_leader_split', 'none', 'unsure'
);

CREATE TABLE "commission"."commission_declarations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "status" "commission"."commission_declaration_status" NOT NULL DEFAULT 'draft',
    "submitted_at" TIMESTAMPTZ,
    "reviewed_at" TIMESTAMPTZ,
    "reviewed_by" UUID,
    "reject_reason" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_by" UUID,
    "updated_by" UUID,
    "deleted_at" TIMESTAMPTZ,
    "deleted_by" UUID,

    CONSTRAINT "commission_declarations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_declarations_employee_id_status_idx"
  ON "commission"."commission_declarations"("employee_id", "status");
CREATE INDEX "commission_declarations_company_id_status_idx"
  ON "commission"."commission_declarations"("company_id", "status");

ALTER TABLE "commission"."commission_declarations"
  ADD CONSTRAINT "commission_declarations_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission"."commission_declarations"
  ADD CONSTRAINT "commission_declarations_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "commission"."commission_declaration_assignments" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "declaration_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "team_id" UUID NOT NULL,
    "assignment_type" "commission"."commission_declaration_assignment_type" NOT NULL,
    "commission_method" "commission"."commission_declaration_method" NOT NULL,
    "big_leader_percent" DECIMAL(5,2),
    "employee_percent" DECIMAL(5,2),
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deleted_at" TIMESTAMPTZ,

    CONSTRAINT "commission_declaration_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "commission_declaration_assignments_declaration_id_idx"
  ON "commission"."commission_declaration_assignments"("declaration_id");
CREATE INDEX "commission_declaration_assignments_company_id_team_id_idx"
  ON "commission"."commission_declaration_assignments"("company_id", "team_id");

ALTER TABLE "commission"."commission_declaration_assignments"
  ADD CONSTRAINT "commission_declaration_assignments_declaration_id_fkey"
  FOREIGN KEY ("declaration_id") REFERENCES "commission"."commission_declarations"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission"."commission_declaration_assignments"
  ADD CONSTRAINT "commission_declaration_assignments_company_id_fkey"
  FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "commission"."commission_declaration_assignments"
  ADD CONSTRAINT "commission_declaration_assignments_team_id_fkey"
  FOREIGN KEY ("team_id") REFERENCES "marketing"."teams"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
