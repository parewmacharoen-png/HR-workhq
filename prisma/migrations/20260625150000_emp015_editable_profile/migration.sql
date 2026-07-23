-- EMP-015 — Editable employee profile, archive/restore, change history

ALTER TABLE employee.employees
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS archived_by UUID,
  ADD COLUMN IF NOT EXISTS archive_reason VARCHAR(512),
  ADD COLUMN IF NOT EXISTS restored_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS restored_by UUID,
  ADD COLUMN IF NOT EXISTS restore_reason VARCHAR(512);

CREATE TYPE employee.employee_change_type AS ENUM ('profile', 'employment', 'payroll', 'salary', 'access', 'archive', 'restore', 'delete');
CREATE TYPE employee.employee_change_source AS ENUM ('web', 'telegram', 'import', 'workflow', 'system');
CREATE TYPE employee.employee_profile_change_request_status AS ENUM ('pending', 'approved', 'rejected', 'cancelled');

CREATE TABLE IF NOT EXISTS employee.employee_change_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_id UUID,
  change_type employee.employee_change_type NOT NULL,
  field_name VARCHAR(80),
  before_value_json JSONB,
  after_value_json JSONB,
  reason VARCHAR(512),
  changed_by UUID NOT NULL,
  changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  source employee.employee_change_source NOT NULL DEFAULT 'web'
);
CREATE INDEX IF NOT EXISTS employee_change_history_employee_changed_idx ON employee.employee_change_history(employee_id, changed_at DESC);

CREATE TABLE IF NOT EXISTS employee.employee_profile_change_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_id UUID NOT NULL,
  requested_by_user_id UUID NOT NULL,
  requested_fields_json JSONB NOT NULL,
  status employee.employee_profile_change_request_status NOT NULL DEFAULT 'pending',
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  rejection_reason VARCHAR(512),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS employee_profile_change_requests_employee_status_idx ON employee.employee_profile_change_requests(employee_id, status);
