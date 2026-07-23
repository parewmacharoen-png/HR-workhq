-- P0-005 Daily Workforce Core

CREATE TABLE attendance.shifts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  name VARCHAR(120) NOT NULL,
  start_minutes INT NOT NULL,
  end_minutes INT NOT NULL,
  crosses_midnight BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX shifts_company_id_idx ON attendance.shifts(company_id);

CREATE TABLE attendance.employee_shift_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  shift_id UUID NOT NULL REFERENCES attendance.shifts(id),
  effective_from DATE NOT NULL,
  effective_to DATE,
  reason TEXT,
  assigned_by_id UUID REFERENCES permission.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX employee_shift_assignments_employee_id_idx
  ON attendance.employee_shift_assignments(employee_id);
CREATE INDEX employee_shift_assignments_effective_idx
  ON attendance.employee_shift_assignments(employee_id, effective_from, effective_to);

ALTER TABLE attendance.attendance_records
  ADD COLUMN shift_id UUID REFERENCES attendance.shifts(id),
  ADD COLUMN shift_start_at TIMESTAMPTZ,
  ADD COLUMN shift_end_at TIMESTAMPTZ,
  ADD COLUMN break_start_at TIMESTAMPTZ,
  ADD COLUMN break_end_at TIMESTAMPTZ,
  ADD COLUMN rounded_late_hours DECIMAL(5, 2) NOT NULL DEFAULT 0;

ALTER TABLE attendance.overtime_records
  ADD COLUMN attendance_record_id UUID REFERENCES attendance.attendance_records(id),
  ADD COLUMN ot_start_at TIMESTAMPTZ,
  ADD COLUMN ot_end_at TIMESTAMPTZ,
  ADD COLUMN ot_minutes INT,
  ADD COLUMN reason TEXT,
  ADD COLUMN approved_by_id UUID REFERENCES permission.users(id),
  ADD COLUMN approved_at TIMESTAMPTZ;

CREATE INDEX overtime_records_attendance_record_id_idx
  ON attendance.overtime_records(attendance_record_id);

CREATE TABLE attendance.monthly_off_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  month DATE NOT NULL,
  selected_dates JSONB NOT NULL DEFAULT '[]',
  status attendance.approval_status NOT NULL DEFAULT 'pending',
  workflow_instance_id UUID REFERENCES workflow.workflow_instances(id),
  approved_by_id UUID REFERENCES permission.users(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX monthly_off_requests_employee_month_idx
  ON attendance.monthly_off_requests(employee_id, month);
CREATE INDEX monthly_off_requests_status_idx
  ON attendance.monthly_off_requests(status);

ALTER TYPE workflow.entity_type ADD VALUE IF NOT EXISTS 'monthly_off';
