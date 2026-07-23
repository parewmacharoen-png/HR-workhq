-- HR-15 completion: approval channel on actions + temporary delegation

CREATE TYPE workflow.action_channel AS ENUM ('web', 'telegram', 'system');

ALTER TABLE workflow.workflow_actions
  ADD COLUMN IF NOT EXISTS channel workflow.action_channel NOT NULL DEFAULT 'system';

CREATE TABLE workflow.approval_delegations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  delegator_user_id UUID NOT NULL REFERENCES permission.users(id),
  delegate_user_id UUID NOT NULL REFERENCES permission.users(id),
  company_id UUID REFERENCES organization.companies(id),
  entity_type workflow.entity_type,
  reason VARCHAR(500),
  valid_from TIMESTAMPTZ NOT NULL DEFAULT now(),
  valid_to TIMESTAMPTZ NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES permission.users(id),
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX approval_delegations_delegate_active_idx
  ON workflow.approval_delegations (delegate_user_id, is_active, valid_from, valid_to);
CREATE INDEX approval_delegations_delegator_active_idx
  ON workflow.approval_delegations (delegator_user_id, is_active);
