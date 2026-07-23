ALTER TYPE workflow.entity_type ADD VALUE IF NOT EXISTS 'document_request';

CREATE TYPE employee.document_request_status AS ENUM (
  'pending',
  'approved',
  'rejected',
  'generating',
  'ready',
  'failed'
);

CREATE TYPE employee.document_generation_job_status AS ENUM (
  'pending',
  'processing',
  'completed',
  'failed'
);

CREATE TABLE employee.document_request_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key VARCHAR(60) NOT NULL UNIQUE,
  name_th VARCHAR(120) NOT NULL,
  name_en VARCHAR(120) NOT NULL,
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE employee.document_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  type_id UUID NOT NULL REFERENCES employee.document_request_types(id),
  status employee.document_request_status NOT NULL DEFAULT 'pending',
  form_data JSONB NOT NULL DEFAULT '{}',
  workflow_instance_id UUID REFERENCES workflow.workflow_instances(id),
  employee_document_id UUID REFERENCES employee.employee_documents(id),
  rejection_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  updated_by UUID
);

CREATE TABLE employee.document_generation_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_request_id UUID NOT NULL UNIQUE REFERENCES employee.document_requests(id),
  status employee.document_generation_job_status NOT NULL DEFAULT 'pending',
  output_file_key VARCHAR(512),
  error_message TEXT,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX document_requests_employee_idx ON employee.document_requests(employee_id);
CREATE INDEX document_requests_company_status_idx ON employee.document_requests(company_id, status);

INSERT INTO employee.document_request_types (key, name_th, name_en, description) VALUES
  ('employment_certificate', 'หนังสือรับรองการทำงาน', 'Employment Certificate', 'Employment certificate'),
  ('salary_certificate', 'หนังสือรับรองเงินเดือน', 'Salary Certificate', 'Salary certificate'),
  ('tax_documents', 'เอกสารภาษี', 'Tax Documents', 'Tax related documents'),
  ('custom', 'เอกสารอื่นๆ', 'Custom Document', 'Custom HR document request')
ON CONFLICT (key) DO NOTHING;
