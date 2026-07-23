-- WorkHQ Phase 2 HR OS — Workflow Builder, Formula Engine, Approval Builder,
-- AI Manager, Competency Matrix, Succession Planning, Knowledge Graph

-- Request type versioning lineage
ALTER TABLE workflow.request_types
  ADD COLUMN IF NOT EXISTS root_id UUID REFERENCES workflow.request_types(id),
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES workflow.request_types(id),
  ADD COLUMN IF NOT EXISTS published_by UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

ALTER TABLE workflow.request_type_versions
  ADD COLUMN IF NOT EXISTS standalone_approval_flow_id UUID;

ALTER TABLE workflow.request_approval_step_instances
  ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'web';

-- Formula engine extensions
CREATE TYPE system.formula_domain AS ENUM (
  'payroll', 'attendance', 'leave', 'commission_admin', 'kpi',
  'performance', 'referral', 'probation', 'general'
);
CREATE TYPE system.formula_config_status AS ENUM ('draft', 'published', 'archived');
CREATE TYPE system.formula_variable_data_type AS ENUM ('number', 'currency', 'boolean', 'date', 'text');
CREATE TYPE system.formula_variable_source_type AS ENUM (
  'manual', 'employee', 'attendance', 'leave', 'payroll', 'kpi', 'performance', 'referral', 'system'
);

ALTER TABLE system.formula_definitions
  ADD COLUMN IF NOT EXISTS company_id UUID REFERENCES organization.companies(id),
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS domain system.formula_domain DEFAULT 'general',
  ADD COLUMN IF NOT EXISTS expression TEXT,
  ADD COLUMN IF NOT EXISTS config_status system.formula_config_status DEFAULT 'draft',
  ADD COLUMN IF NOT EXISTS config_version INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS root_id UUID REFERENCES system.formula_definitions(id),
  ADD COLUMN IF NOT EXISTS source_id UUID REFERENCES system.formula_definitions(id),
  ADD COLUMN IF NOT EXISTS published_by UUID,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS system.formula_variables (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_definition_id UUID NOT NULL REFERENCES system.formula_definitions(id) ON DELETE CASCADE,
  key VARCHAR(80) NOT NULL,
  label VARCHAR(160) NOT NULL,
  data_type system.formula_variable_data_type NOT NULL,
  source_type system.formula_variable_source_type NOT NULL,
  source_path VARCHAR(200),
  default_value_json JSONB,
  required BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (formula_definition_id, key)
);

CREATE TABLE IF NOT EXISTS system.formula_execution_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  formula_definition_id UUID NOT NULL REFERENCES system.formula_definitions(id),
  formula_version INT NOT NULL,
  entity_type VARCHAR(60) NOT NULL,
  entity_id UUID NOT NULL,
  input_json JSONB NOT NULL,
  output_json JSONB NOT NULL,
  result NUMERIC(18, 6),
  executed_by UUID,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_formula_execution_logs_def ON system.formula_execution_logs(formula_definition_id, executed_at DESC);

-- Workflow action steps
CREATE TYPE workflow.workflow_action_step_type AS ENUM (
  'approval', 'notification', 'create_record', 'update_record', 'assign_task',
  'generate_document', 'send_telegram', 'wait', 'condition', 'formula'
);

CREATE TABLE IF NOT EXISTS workflow.request_workflow_action_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_type_version_id UUID NOT NULL REFERENCES workflow.request_type_versions(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  step_type workflow.workflow_action_step_type NOT NULL,
  config_json JSONB NOT NULL DEFAULT '{}',
  condition_json JSONB,
  timeout_hours INT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (request_type_version_id, step_order)
);

-- Standalone approval flow builder
CREATE TYPE workflow.approval_flow_config_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE IF NOT EXISTS workflow.approval_flow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES organization.companies(id),
  name VARCHAR(160) NOT NULL,
  description TEXT,
  status workflow.approval_flow_config_status NOT NULL DEFAULT 'draft',
  version INT NOT NULL DEFAULT 1,
  root_id UUID REFERENCES workflow.approval_flow_definitions(id),
  source_id UUID REFERENCES workflow.approval_flow_definitions(id),
  created_by UUID,
  updated_by UUID,
  published_by UUID,
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS workflow.approval_step_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  approval_flow_definition_id UUID NOT NULL REFERENCES workflow.approval_flow_definitions(id) ON DELETE CASCADE,
  step_order INT NOT NULL,
  name VARCHAR(160) NOT NULL,
  approver_type workflow.request_approver_type NOT NULL,
  approver_role VARCHAR(80),
  approver_employee_id UUID REFERENCES employee.employees(id),
  approver_field_key VARCHAR(80),
  required_decision workflow.required_decision_type NOT NULL DEFAULT 'any_one',
  condition_json JSONB,
  sla_hours INT,
  escalation_json JSONB,
  notify_telegram BOOLEAN NOT NULL DEFAULT TRUE,
  can_reject BOOLEAN NOT NULL DEFAULT TRUE,
  can_request_more_info BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (approval_flow_definition_id, step_order)
);

ALTER TABLE workflow.request_type_versions
  ADD CONSTRAINT fk_request_type_version_standalone_flow
  FOREIGN KEY (standalone_approval_flow_id)
  REFERENCES workflow.approval_flow_definitions(id);

-- Competency matrix
CREATE TYPE employee.competency_status AS ENUM ('active', 'archived');
CREATE TYPE employee.competency_requirement_importance AS ENUM ('required', 'preferred', 'optional');

CREATE TABLE IF NOT EXISTS employee.competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES organization.companies(id),
  name VARCHAR(160) NOT NULL,
  description TEXT,
  category VARCHAR(80),
  status employee.competency_status NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  archived_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS employee.competency_levels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competency_id UUID NOT NULL REFERENCES employee.competencies(id) ON DELETE CASCADE,
  level INT NOT NULL,
  label VARCHAR(80) NOT NULL,
  description TEXT,
  UNIQUE (competency_id, level)
);

CREATE TABLE IF NOT EXISTS employee.employee_competencies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  competency_id UUID NOT NULL REFERENCES employee.competencies(id),
  current_level INT NOT NULL,
  target_level INT,
  assessed_by UUID,
  assessed_at TIMESTAMPTZ,
  evidence_json JSONB,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (employee_id, competency_id)
);

CREATE TABLE IF NOT EXISTS employee.position_competency_requirements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_definition_id UUID NOT NULL REFERENCES organization.position_definitions(id) ON DELETE CASCADE,
  competency_id UUID NOT NULL REFERENCES employee.competencies(id),
  required_level INT NOT NULL,
  importance employee.competency_requirement_importance NOT NULL DEFAULT 'required',
  UNIQUE (position_definition_id, competency_id)
);

-- Succession planning
CREATE TYPE employee.succession_readiness AS ENUM (
  'ready_now', 'ready_3_months', 'ready_6_months', 'ready_12_months', 'not_ready'
);
CREATE TYPE employee.succession_plan_status AS ENUM ('draft', 'active', 'archived');

CREATE TABLE IF NOT EXISTS employee.critical_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  position_definition_id UUID REFERENCES organization.position_definitions(id),
  name VARCHAR(160) NOT NULL,
  description TEXT,
  risk_level VARCHAR(20) NOT NULL DEFAULT 'medium',
  current_holder_employee_id UUID REFERENCES employee.employees(id),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS employee.succession_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  critical_role_id UUID NOT NULL REFERENCES employee.critical_roles(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  readiness employee.succession_readiness NOT NULL DEFAULT 'not_ready',
  strengths_json JSONB,
  gaps_json JSONB,
  development_plan TEXT,
  nominated_by UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (critical_role_id, employee_id)
);

CREATE TABLE IF NOT EXISTS employee.succession_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  name VARCHAR(160) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  status employee.succession_plan_status NOT NULL DEFAULT 'draft',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- AI Manager
CREATE TYPE ai.ai_insight_type AS ENUM (
  'attendance_risk', 'leave_risk', 'probation_overdue', 'kpi_drop', 'performance_drop',
  'document_missing', 'training_overdue', 'announcement_overdue', 'approval_overdue',
  'exit_risk', 'payroll_attention', 'referral_pending', 'critical_role_no_backup', 'succession_ready'
);
CREATE TYPE ai.ai_insight_severity AS ENUM ('low', 'medium', 'high', 'critical');
CREATE TYPE ai.ai_insight_status AS ENUM ('open', 'acknowledged', 'resolved', 'dismissed');
CREATE TYPE ai.ai_brief_delivery_status AS ENUM ('pending', 'sent', 'failed');

CREATE TABLE IF NOT EXISTS ai.ai_insights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  employee_id UUID REFERENCES employee.employees(id),
  insight_type ai.ai_insight_type NOT NULL,
  severity ai.ai_insight_severity NOT NULL DEFAULT 'medium',
  title VARCHAR(240) NOT NULL,
  summary TEXT NOT NULL,
  evidence_json JSONB,
  recommended_action TEXT,
  status ai.ai_insight_status NOT NULL DEFAULT 'open',
  related_entity_type VARCHAR(60),
  related_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_ai_insights_company ON ai.ai_insights(company_id, status, severity);

CREATE TABLE IF NOT EXISTS ai.ai_morning_briefs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES organization.companies(id),
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_to_employee_id UUID NOT NULL,
  summary_text TEXT NOT NULL,
  sections_json JSONB NOT NULL,
  insight_ids JSONB NOT NULL DEFAULT '[]',
  delivery_status ai.ai_brief_delivery_status NOT NULL DEFAULT 'pending'
);
