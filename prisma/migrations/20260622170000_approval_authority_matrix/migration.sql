-- HR-15: Approval Authority Matrix
ALTER TYPE workflow.approver_rule ADD VALUE IF NOT EXISTS 'direct_manager';
ALTER TYPE workflow.approver_rule ADD VALUE IF NOT EXISTS 'secretary';

CREATE TYPE workflow.approval_mode AS ENUM ('sequential', 'parallel');
CREATE TYPE workflow.approver_strategy AS ENUM (
  'direct_manager',
  'big_leader',
  'owner',
  'secretary',
  'fixed_user',
  'fixed_role',
  'workflow_override'
);

CREATE TABLE workflow.approval_authority_matrices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_type VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  approval_mode workflow.approval_mode NOT NULL DEFAULT 'sequential',
  min_approval_count INT NOT NULL DEFAULT 1,
  active BOOLEAN NOT NULL DEFAULT true,
  version INT NOT NULL DEFAULT 1,
  company_id UUID REFERENCES organization.companies(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX approval_authority_matrices_type_active_idx
  ON workflow.approval_authority_matrices (workflow_type, active);
CREATE INDEX approval_authority_matrices_company_idx
  ON workflow.approval_authority_matrices (company_id);

CREATE TABLE workflow.approval_matrix_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  matrix_id UUID NOT NULL REFERENCES workflow.approval_authority_matrices(id),
  step_order INT NOT NULL,
  label VARCHAR(120) NOT NULL,
  approver_strategy workflow.approver_strategy NOT NULL,
  fixed_user_id UUID REFERENCES permission.users(id),
  fixed_role_id UUID REFERENCES permission.roles(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (matrix_id, step_order)
);

CREATE INDEX approval_matrix_steps_matrix_idx ON workflow.approval_matrix_steps (matrix_id);
