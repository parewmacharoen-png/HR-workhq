-- Sprint 7: commission adjustment workflow

CREATE TYPE commission.commission_adjustment_status AS ENUM (
  'draft',
  'submitted',
  'approved',
  'rejected',
  'applied'
);

CREATE TYPE commission.commission_adjustment_direction AS ENUM (
  'increase',
  'decrease'
);

CREATE TYPE commission.commission_adjustment_source_type AS ENUM (
  'marketing_member',
  'admin_member',
  'recruitment_record',
  'referral'
);

CREATE TYPE commission.commission_adjustment_audit_action AS ENUM (
  'submit',
  'approve',
  'reject',
  'apply'
);

ALTER TYPE payroll.item_type ADD VALUE IF NOT EXISTS 'commission_adjustment';
ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'commission_adjustment';

CREATE TABLE commission.commission_adjustment_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  earn_cycle_id UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
  commission_cycle_id UUID NOT NULL REFERENCES commission.commission_cycles(id),
  type commission.commission_cycle_type NOT NULL,
  team_id UUID REFERENCES marketing.teams(id),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  source_result_id UUID,
  reason TEXT NOT NULL,
  adjustment_amount NUMERIC(14, 2) NOT NULL,
  direction commission.commission_adjustment_direction NOT NULL,
  status commission.commission_adjustment_status NOT NULL DEFAULT 'draft',
  workflow_instance_id UUID,
  submitted_by UUID,
  submitted_at TIMESTAMPTZ,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  applied_by UUID,
  applied_at TIMESTAMPTZ,
  rejected_by UUID,
  rejected_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX commission_adjustment_requests_company_cycle_idx
  ON commission.commission_adjustment_requests (company_id, earn_cycle_id, type)
  WHERE deleted_at IS NULL;

CREATE INDEX commission_adjustment_requests_employee_status_idx
  ON commission.commission_adjustment_requests (employee_id, status)
  WHERE deleted_at IS NULL;

CREATE INDEX commission_adjustment_requests_cycle_idx
  ON commission.commission_adjustment_requests (commission_cycle_id)
  WHERE deleted_at IS NULL;

CREATE TABLE commission.commission_adjustment_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_request_id UUID NOT NULL REFERENCES commission.commission_adjustment_requests(id),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  source_result_id UUID NOT NULL,
  source_result_type commission.commission_adjustment_source_type NOT NULL,
  original_amount NUMERIC(14, 2) NOT NULL,
  adjustment_amount NUMERIC(14, 2) NOT NULL,
  net_amount NUMERIC(14, 2) NOT NULL,
  payroll_item_id UUID REFERENCES payroll.payroll_items(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX commission_adjustment_entries_request_idx
  ON commission.commission_adjustment_entries (adjustment_request_id);

CREATE INDEX commission_adjustment_entries_employee_idx
  ON commission.commission_adjustment_entries (employee_id);

CREATE TABLE commission.commission_adjustment_audits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  adjustment_request_id UUID NOT NULL REFERENCES commission.commission_adjustment_requests(id),
  action commission.commission_adjustment_audit_action NOT NULL,
  user_id UUID NOT NULL,
  before_status commission.commission_adjustment_status,
  after_status commission.commission_adjustment_status NOT NULL,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX commission_adjustment_audits_request_created_idx
  ON commission.commission_adjustment_audits (adjustment_request_id, created_at);
