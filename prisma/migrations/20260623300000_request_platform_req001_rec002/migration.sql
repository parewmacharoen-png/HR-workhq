-- REQ-001..004 + REC-002 Request Platform

CREATE TYPE "workflow"."request_instance_status" AS ENUM (
  'draft', 'submitted', 'in_review', 'approved', 'rejected', 'cancelled', 'completed'
);
CREATE TYPE "workflow"."request_approval_step_status" AS ENUM (
  'pending', 'approved', 'rejected', 'skipped', 'cancelled'
);
CREATE TYPE "workflow"."request_timeline_event_type" AS ENUM (
  'created', 'submitted', 'step_assigned', 'approved', 'rejected', 'cancelled',
  'completed', 'value_changed', 'comment_added', 'file_uploaded', 'integration_action_executed'
);
CREATE TYPE "workflow"."request_comment_visibility" AS ENUM ('internal', 'requester_visible');
CREATE TYPE "workflow"."request_type_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "workflow"."request_type_version_status" AS ENUM ('draft', 'published', 'archived');
CREATE TYPE "workflow"."request_type_category" AS ENUM (
  'leave', 'attendance', 'payroll', 'document', 'shift', 'general', 'custom'
);
CREATE TYPE "workflow"."request_form_field_type" AS ENUM (
  'text', 'textarea', 'number', 'currency', 'date', 'datetime', 'time', 'boolean',
  'select', 'multi_select', 'radio', 'checkbox', 'file_upload', 'image_upload',
  'employee_picker', 'company_picker', 'team_picker', 'position_picker', 'formula', 'system_auto_fill'
);
CREATE TYPE "workflow"."request_approval_flow_status" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "workflow"."request_approver_type" AS ENUM (
  'requester_big_leader', 'requester_sub_leader', 'requester_direct_manager',
  'owner', 'secretary', 'role', 'specific_employee', 'employee_field'
);
CREATE TYPE "workflow"."required_decision_type" AS ENUM ('any_one', 'all');

CREATE TYPE "referral"."referral_program_status" AS ENUM ('draft', 'active', 'archived');
CREATE TYPE "referral"."referral_eligibility_rule" AS ENUM ('after_probation_pass');
CREATE TYPE "referral"."employee_referral_status" AS ENUM (
  'submitted', 'screening', 'interviewed', 'hired', 'probation', 'probation_passed',
  'bonus_eligible', 'bonus_approved', 'paid', 'rejected', 'cancelled'
);
CREATE TYPE "referral"."referral_bonus_payout_status" AS ENUM ('pending', 'approved', 'paid', 'cancelled');

CREATE TABLE "workflow"."request_types" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID,
  "key" VARCHAR(80) NOT NULL,
  "name_th" VARCHAR(160) NOT NULL,
  "name_en" VARCHAR(160),
  "description" TEXT,
  "icon" VARCHAR(40),
  "category" "workflow"."request_type_category" NOT NULL DEFAULT 'general',
  "status" "workflow"."request_type_status" NOT NULL DEFAULT 'draft',
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_by" UUID,
  "updated_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "archived_at" TIMESTAMPTZ,
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "request_types_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "request_types_company_id_key_key" ON "workflow"."request_types"("company_id", "key");
CREATE INDEX "request_types_company_id_status_idx" ON "workflow"."request_types"("company_id", "status");
CREATE INDEX "request_types_category_idx" ON "workflow"."request_types"("category");

CREATE TABLE "workflow"."request_type_versions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_type_id" UUID NOT NULL,
  "version_number" INTEGER NOT NULL,
  "status" "workflow"."request_type_version_status" NOT NULL DEFAULT 'draft',
  "name_snapshot" VARCHAR(160) NOT NULL,
  "description_snapshot" TEXT,
  "icon_snapshot" VARCHAR(40),
  "category_snapshot" "workflow"."request_type_category" NOT NULL,
  "visible_to_roles_json" JSONB,
  "visible_to_companies_json" JSONB,
  "visible_to_departments_json" JSONB,
  "requires_attachment" BOOLEAN NOT NULL DEFAULT false,
  "allow_cancel_by_requester" BOOLEAN NOT NULL DEFAULT true,
  "cancel_before_approval_only" BOOLEAN NOT NULL DEFAULT false,
  "sla_hours" INTEGER,
  "notify_requester_on_step_change" BOOLEAN NOT NULL DEFAULT true,
  "notify_leaders_on_submit" BOOLEAN NOT NULL DEFAULT true,
  "telegram_menu_order" INTEGER NOT NULL DEFAULT 0,
  "telegram_menu_icon" VARCHAR(40),
  "published_at" TIMESTAMPTZ,
  "published_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_type_versions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_type_versions_request_type_id_fkey" FOREIGN KEY ("request_type_id") REFERENCES "workflow"."request_types"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "request_type_versions_request_type_id_version_number_key" ON "workflow"."request_type_versions"("request_type_id", "version_number");
CREATE INDEX "request_type_versions_request_type_id_status_idx" ON "workflow"."request_type_versions"("request_type_id", "status");

CREATE TABLE "workflow"."request_form_fields" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_type_version_id" UUID NOT NULL,
  "key" VARCHAR(80) NOT NULL,
  "label_th" VARCHAR(200) NOT NULL,
  "label_en" VARCHAR(200),
  "description" TEXT,
  "field_type" "workflow"."request_form_field_type" NOT NULL,
  "placeholder" VARCHAR(200),
  "help_text" TEXT,
  "required" BOOLEAN NOT NULL DEFAULT false,
  "order" INTEGER NOT NULL DEFAULT 0,
  "default_value_json" JSONB,
  "options_json" JSONB,
  "validation_json" JSONB,
  "visibility_condition_json" JSONB,
  "formula_json" JSONB,
  "source_json" JSONB,
  "is_system" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_form_fields_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_form_fields_request_type_version_id_fkey" FOREIGN KEY ("request_type_version_id") REFERENCES "workflow"."request_type_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "request_form_fields_request_type_version_id_key_key" ON "workflow"."request_form_fields"("request_type_version_id", "key");
CREATE INDEX "request_form_fields_request_type_version_id_order_idx" ON "workflow"."request_form_fields"("request_type_version_id", "order");

CREATE TABLE "workflow"."request_approval_flows" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_type_version_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "status" "workflow"."request_approval_flow_status" NOT NULL DEFAULT 'draft',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_approval_flows_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_approval_flows_request_type_version_id_fkey" FOREIGN KEY ("request_type_version_id") REFERENCES "workflow"."request_type_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "request_approval_flows_request_type_version_id_idx" ON "workflow"."request_approval_flows"("request_type_version_id");

CREATE TABLE "workflow"."request_approval_step_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "approval_flow_id" UUID NOT NULL,
  "step_order" INTEGER NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "approver_type" "workflow"."request_approver_type" NOT NULL,
  "approver_role" VARCHAR(80),
  "approver_employee_id" UUID,
  "approver_field_key" VARCHAR(80),
  "required_decision" "workflow"."required_decision_type" NOT NULL DEFAULT 'any_one',
  "can_reject" BOOLEAN NOT NULL DEFAULT true,
  "can_request_more_info" BOOLEAN NOT NULL DEFAULT false,
  "sla_hours" INTEGER,
  "condition_json" JSONB,
  "notify_telegram" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_approval_step_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_approval_step_definitions_approval_flow_id_fkey" FOREIGN KEY ("approval_flow_id") REFERENCES "workflow"."request_approval_flows"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "request_approval_step_definitions_approver_employee_id_fkey" FOREIGN KEY ("approver_employee_id") REFERENCES "employee"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "request_approval_step_definitions_approval_flow_id_step_order_key" ON "workflow"."request_approval_step_definitions"("approval_flow_id", "step_order");
CREATE INDEX "request_approval_step_definitions_approval_flow_id_idx" ON "workflow"."request_approval_step_definitions"("approval_flow_id");

CREATE TABLE "workflow"."request_instances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "request_type_id" UUID NOT NULL,
  "request_type_version_id" UUID NOT NULL,
  "requester_employee_id" UUID NOT NULL,
  "requester_user_id" UUID,
  "title" VARCHAR(240) NOT NULL,
  "status" "workflow"."request_instance_status" NOT NULL DEFAULT 'draft',
  "current_step_id" UUID,
  "submitted_at" TIMESTAMPTZ,
  "approved_at" TIMESTAMPTZ,
  "rejected_at" TIMESTAMPTZ,
  "cancelled_at" TIMESTAMPTZ,
  "completed_at" TIMESTAMPTZ,
  "cancelled_reason" TEXT,
  "final_decision_by" UUID,
  "final_decision_note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "deleted_at" TIMESTAMPTZ,
  CONSTRAINT "request_instances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_instances_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "request_instances_request_type_id_fkey" FOREIGN KEY ("request_type_id") REFERENCES "workflow"."request_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "request_instances_request_type_version_id_fkey" FOREIGN KEY ("request_type_version_id") REFERENCES "workflow"."request_type_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "request_instances_requester_employee_id_fkey" FOREIGN KEY ("requester_employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "request_instances_requester_user_id_fkey" FOREIGN KEY ("requester_user_id") REFERENCES "permission"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "request_instances_final_decision_by_fkey" FOREIGN KEY ("final_decision_by") REFERENCES "permission"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "request_instances_company_id_status_idx" ON "workflow"."request_instances"("company_id", "status");
CREATE INDEX "request_instances_requester_employee_id_idx" ON "workflow"."request_instances"("requester_employee_id");
CREATE INDEX "request_instances_request_type_id_idx" ON "workflow"."request_instances"("request_type_id");
CREATE INDEX "request_instances_submitted_at_idx" ON "workflow"."request_instances"("submitted_at");

CREATE TABLE "workflow"."request_approval_step_instances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_instance_id" UUID NOT NULL,
  "step_definition_id" UUID,
  "step_order" INTEGER NOT NULL,
  "approver_type_snapshot" VARCHAR(40) NOT NULL,
  "approver_role_snapshot" VARCHAR(80),
  "approver_employee_id" UUID,
  "approver_user_id" UUID,
  "status" "workflow"."request_approval_step_status" NOT NULL DEFAULT 'pending',
  "acted_by" UUID,
  "acted_at" TIMESTAMPTZ,
  "note" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_approval_step_instances_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_approval_step_instances_request_instance_id_fkey" FOREIGN KEY ("request_instance_id") REFERENCES "workflow"."request_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "request_approval_step_instances_step_definition_id_fkey" FOREIGN KEY ("step_definition_id") REFERENCES "workflow"."request_approval_step_definitions"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "request_approval_step_instances_approver_employee_id_fkey" FOREIGN KEY ("approver_employee_id") REFERENCES "employee"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "request_approval_step_instances_approver_user_id_fkey" FOREIGN KEY ("approver_user_id") REFERENCES "permission"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "request_approval_step_instances_acted_by_fkey" FOREIGN KEY ("acted_by") REFERENCES "permission"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "request_approval_step_instances_request_instance_id_step_order_idx" ON "workflow"."request_approval_step_instances"("request_instance_id", "step_order");
CREATE INDEX "request_approval_step_instances_approver_employee_id_status_idx" ON "workflow"."request_approval_step_instances"("approver_employee_id", "status");

ALTER TABLE "workflow"."request_instances"
  ADD CONSTRAINT "request_instances_current_step_id_fkey"
  FOREIGN KEY ("current_step_id") REFERENCES "workflow"."request_approval_step_instances"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "workflow"."request_values" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_instance_id" UUID NOT NULL,
  "field_id" UUID,
  "field_key" VARCHAR(80) NOT NULL,
  "field_label_snapshot" VARCHAR(200) NOT NULL,
  "field_type_snapshot" VARCHAR(40) NOT NULL,
  "value_json" JSONB NOT NULL,
  "value_text" TEXT,
  "file_attachment_id" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_values_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_values_request_instance_id_fkey" FOREIGN KEY ("request_instance_id") REFERENCES "workflow"."request_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "request_values_field_id_fkey" FOREIGN KEY ("field_id") REFERENCES "workflow"."request_form_fields"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "request_values_request_instance_id_field_key_key" ON "workflow"."request_values"("request_instance_id", "field_key");
CREATE INDEX "request_values_request_instance_id_idx" ON "workflow"."request_values"("request_instance_id");

CREATE TABLE "workflow"."request_timeline_events" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_instance_id" UUID NOT NULL,
  "event_type" "workflow"."request_timeline_event_type" NOT NULL,
  "actor_employee_id" UUID,
  "actor_user_id" UUID,
  "message" TEXT,
  "payload_json" JSONB,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_timeline_events_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_timeline_events_request_instance_id_fkey" FOREIGN KEY ("request_instance_id") REFERENCES "workflow"."request_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "request_timeline_events_actor_employee_id_fkey" FOREIGN KEY ("actor_employee_id") REFERENCES "employee"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "request_timeline_events_actor_user_id_fkey" FOREIGN KEY ("actor_user_id") REFERENCES "permission"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "request_timeline_events_request_instance_id_created_at_idx" ON "workflow"."request_timeline_events"("request_instance_id", "created_at");

CREATE TABLE "workflow"."request_comments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "request_instance_id" UUID NOT NULL,
  "author_employee_id" UUID NOT NULL,
  "comment" TEXT NOT NULL,
  "visibility" "workflow"."request_comment_visibility" NOT NULL DEFAULT 'requester_visible',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "request_comments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "request_comments_request_instance_id_fkey" FOREIGN KEY ("request_instance_id") REFERENCES "workflow"."request_instances"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "request_comments_author_employee_id_fkey" FOREIGN KEY ("author_employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "request_comments_request_instance_id_idx" ON "workflow"."request_comments"("request_instance_id");

CREATE TABLE "referral"."referral_programs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "bonus_amount" DECIMAL(14,2) NOT NULL,
  "currency" VARCHAR(8) NOT NULL DEFAULT 'THB',
  "eligibility_rule" "referral"."referral_eligibility_rule" NOT NULL DEFAULT 'after_probation_pass',
  "status" "referral"."referral_program_status" NOT NULL DEFAULT 'draft',
  "created_by" UUID,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "referral_programs_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_programs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "referral_programs_company_id_status_idx" ON "referral"."referral_programs"("company_id", "status");

CREATE TABLE "referral"."employee_referrals" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "referrer_employee_id" UUID NOT NULL,
  "candidate_name" VARCHAR(160) NOT NULL,
  "candidate_phone" VARCHAR(32) NOT NULL,
  "candidate_line_id" VARCHAR(80),
  "candidate_email" VARCHAR(160),
  "target_position" VARCHAR(120),
  "note" TEXT,
  "status" "referral"."employee_referral_status" NOT NULL DEFAULT 'submitted',
  "referred_employee_id" UUID,
  "probation_review_id" UUID,
  "referral_program_id" UUID,
  "submitted_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "hired_at" TIMESTAMPTZ,
  "probation_passed_at" TIMESTAMPTZ,
  "bonus_eligible_at" TIMESTAMPTZ,
  "bonus_approved_at" TIMESTAMPTZ,
  "paid_at" TIMESTAMPTZ,
  "rejected_reason" TEXT,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "employee_referrals_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "employee_referrals_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "employee_referrals_referrer_employee_id_fkey" FOREIGN KEY ("referrer_employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "employee_referrals_referred_employee_id_fkey" FOREIGN KEY ("referred_employee_id") REFERENCES "employee"."employees"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "employee_referrals_probation_review_id_fkey" FOREIGN KEY ("probation_review_id") REFERENCES "performance"."probation_reviews"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "employee_referrals_referral_program_id_fkey" FOREIGN KEY ("referral_program_id") REFERENCES "referral"."referral_programs"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "employee_referrals_company_id_status_idx" ON "referral"."employee_referrals"("company_id", "status");
CREATE INDEX "employee_referrals_referrer_employee_id_idx" ON "referral"."employee_referrals"("referrer_employee_id");

CREATE TABLE "referral"."referral_bonus_payouts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "referral_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "payroll_cycle_id" UUID,
  "amount" DECIMAL(14,2) NOT NULL,
  "status" "referral"."referral_bonus_payout_status" NOT NULL DEFAULT 'pending',
  "approved_by" UUID,
  "paid_at" TIMESTAMPTZ,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT "referral_bonus_payouts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "referral_bonus_payouts_referral_id_fkey" FOREIGN KEY ("referral_id") REFERENCES "referral"."employee_referrals"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "referral_bonus_payouts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "referral_bonus_payouts_payroll_cycle_id_fkey" FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll"."payroll_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "referral_bonus_payouts_referral_id_idx" ON "referral"."referral_bonus_payouts"("referral_id");
CREATE INDEX "referral_bonus_payouts_employee_id_status_idx" ON "referral"."referral_bonus_payouts"("employee_id", "status");
