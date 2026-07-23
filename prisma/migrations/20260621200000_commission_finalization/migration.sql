-- Sprint 6: unified commission finalization workflow

CREATE TYPE commission.commission_cycle_type AS ENUM (
  'marketing',
  'admin',
  'referral',
  'recruitment'
);

CREATE TYPE commission.commission_cycle_status AS ENUM (
  'draft',
  'approved',
  'finalized',
  'locked'
);

CREATE TYPE commission.commission_cycle_audit_action AS ENUM (
  'approve',
  'finalize',
  'lock'
);

ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'referral_commission';
ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'recruitment_commission';

CREATE TABLE commission.commission_cycles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  earn_cycle_id UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
  type commission.commission_cycle_type NOT NULL,
  team_id UUID REFERENCES marketing.teams(id),
  source_cycle_id UUID NOT NULL,
  status commission.commission_cycle_status NOT NULL DEFAULT 'draft',
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  finalized_by UUID,
  finalized_at TIMESTAMPTZ,
  locked_by UUID,
  locked_at TIMESTAMPTZ,
  total_commission NUMERIC(14, 2) NOT NULL DEFAULT 0,
  total_recipients INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE UNIQUE INDEX commission_cycles_unique_idx
  ON commission.commission_cycles (company_id, type, source_cycle_id)
  WHERE deleted_at IS NULL;

CREATE INDEX commission_cycles_company_status_idx
  ON commission.commission_cycles (company_id, status)
  WHERE deleted_at IS NULL;

CREATE TABLE commission.commission_cycle_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_cycle_id UUID NOT NULL REFERENCES commission.commission_cycles(id),
  action commission.commission_cycle_audit_action NOT NULL,
  user_id UUID NOT NULL,
  before_status commission.commission_cycle_status,
  after_status commission.commission_cycle_status NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX commission_cycle_audits_cycle_created_idx
  ON commission.commission_cycle_audits (commission_cycle_id, created_at);
