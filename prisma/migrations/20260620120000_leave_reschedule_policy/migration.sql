-- Leave reschedule policy enhancement

ALTER TYPE workflow.entity_type ADD VALUE IF NOT EXISTS 'leave_reschedule';
ALTER TYPE workflow.entity_type ADD VALUE IF NOT EXISTS 'leave_shift_swap';

CREATE TYPE leave.reschedule_status AS ENUM ('pending', 'approved', 'rejected');
CREATE TYPE leave.shift_swap_status AS ENUM ('pending_partner', 'pending_approval', 'approved', 'rejected');

ALTER TABLE leave.leave_requests
  ADD COLUMN IF NOT EXISTS reschedule_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE leave.leave_reschedule_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leave_request_id UUID NOT NULL REFERENCES leave.leave_requests(id),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  original_start_date DATE NOT NULL,
  original_end_date DATE NOT NULL,
  original_days NUMERIC(5, 2) NOT NULL,
  new_start_date DATE NOT NULL,
  new_end_date DATE NOT NULL,
  new_days NUMERIC(5, 2) NOT NULL,
  reason TEXT NOT NULL,
  is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
  workflow_instance_id UUID REFERENCES workflow.workflow_instances(id),
  status leave.reschedule_status NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  CHECK (new_end_date >= new_start_date),
  CHECK (original_days > 0),
  CHECK (new_days > 0)
);

CREATE INDEX leave_reschedule_requests_leave_request_id_idx
  ON leave.leave_reschedule_requests (leave_request_id);
CREATE INDEX leave_reschedule_requests_employee_id_idx
  ON leave.leave_reschedule_requests (employee_id);
CREATE INDEX leave_reschedule_requests_company_status_idx
  ON leave.leave_reschedule_requests (company_id, status);
CREATE INDEX leave_reschedule_requests_status_idx
  ON leave.leave_reschedule_requests (status);

CREATE TABLE leave.leave_shift_swap_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  requester_employee_id UUID NOT NULL REFERENCES employee.employees(id),
  partner_employee_id UUID NOT NULL REFERENCES employee.employees(id),
  requester_leave_request_id UUID NOT NULL REFERENCES leave.leave_requests(id),
  partner_leave_request_id UUID NOT NULL REFERENCES leave.leave_requests(id),
  requester_agreed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  partner_agreed_at TIMESTAMPTZ,
  workflow_instance_id UUID REFERENCES workflow.workflow_instances(id),
  status leave.shift_swap_status NOT NULL DEFAULT 'pending_partner',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  CHECK (requester_employee_id <> partner_employee_id),
  CHECK (requester_leave_request_id <> partner_leave_request_id)
);

CREATE INDEX leave_shift_swap_requests_requester_idx
  ON leave.leave_shift_swap_requests (requester_employee_id);
CREATE INDEX leave_shift_swap_requests_partner_idx
  ON leave.leave_shift_swap_requests (partner_employee_id);
CREATE INDEX leave_shift_swap_requests_company_status_idx
  ON leave.leave_shift_swap_requests (company_id, status);
CREATE INDEX leave_shift_swap_requests_status_idx
  ON leave.leave_shift_swap_requests (status);
