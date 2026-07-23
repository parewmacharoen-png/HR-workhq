-- Employee personal domain: government IDs, education, work experience

ALTER TABLE employee.employees
  ADD COLUMN IF NOT EXISTS gender VARCHAR(20),
  ADD COLUMN IF NOT EXISTS tax_id VARCHAR(64),
  ADD COLUMN IF NOT EXISTS social_security_number VARCHAR(64),
  ADD COLUMN IF NOT EXISTS passport_number VARCHAR(64),
  ADD COLUMN IF NOT EXISTS profile_photo_document_id UUID;

ALTER TYPE employee.employee_change_type ADD VALUE IF NOT EXISTS 'education';
ALTER TYPE employee.employee_change_type ADD VALUE IF NOT EXISTS 'experience';

CREATE TABLE IF NOT EXISTS employee.employee_education (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  institution VARCHAR(200) NOT NULL,
  degree VARCHAR(120),
  field_of_study VARCHAR(120),
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX IF NOT EXISTS employee_education_employee_id_sort_order_idx
  ON employee.employee_education (employee_id, sort_order);

CREATE TABLE IF NOT EXISTS employee.employee_work_experience (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_name VARCHAR(200) NOT NULL,
  job_title VARCHAR(120) NOT NULL,
  location VARCHAR(120),
  start_date DATE,
  end_date DATE,
  is_current BOOLEAN NOT NULL DEFAULT false,
  description TEXT,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID
);

CREATE INDEX IF NOT EXISTS employee_work_experience_employee_id_sort_order_idx
  ON employee.employee_work_experience (employee_id, sort_order);
