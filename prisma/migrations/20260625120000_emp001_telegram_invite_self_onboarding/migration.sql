-- EMP-001b / EMP-001c — Telegram invite link + employee self-onboarding

ALTER TYPE telegram.telegram_verification_method ADD VALUE IF NOT EXISTS 'invite_link';

CREATE TYPE employee.employee_telegram_invite_status AS ENUM ('pending', 'used', 'expired', 'cancelled');
CREATE TYPE employee.employee_self_onboarding_status AS ENUM ('draft', 'submitted', 'approved', 'rejected', 'cancelled');
CREATE TYPE employee.self_onboarding_document_type AS ENUM ('id_card', 'bank_book', 'house_registration', 'profile_photo', 'other');
CREATE TYPE employee.self_onboarding_document_status AS ENUM ('uploaded', 'approved', 'rejected');

ALTER TABLE employee.employees
  ADD COLUMN IF NOT EXISTS line_id VARCHAR(80),
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS emergency_contact_name VARCHAR(160),
  ADD COLUMN IF NOT EXISTS emergency_contact_relationship VARCHAR(80),
  ADD COLUMN IF NOT EXISTS emergency_contact_phone VARCHAR(32);

CREATE TABLE employee.employee_telegram_invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  token_hash VARCHAR(128) NOT NULL,
  token_preview VARCHAR(16) NOT NULL,
  status employee.employee_telegram_invite_status NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ NOT NULL,
  used_at TIMESTAMPTZ,
  used_telegram_user_id BIGINT,
  used_telegram_chat_id BIGINT,
  used_telegram_username VARCHAR(80),
  created_by UUID,
  cancelled_by UUID,
  cancelled_at TIMESTAMPTZ,
  cancellation_reason VARCHAR(500),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_employee_telegram_invites_employee ON employee.employee_telegram_invites(employee_id, status);
CREATE INDEX idx_employee_telegram_invites_token ON employee.employee_telegram_invites(token_hash);
CREATE INDEX idx_employee_telegram_invites_company ON employee.employee_telegram_invites(company_id, status);

CREATE TABLE employee.employee_self_onboarding_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  status employee.employee_self_onboarding_status NOT NULL DEFAULT 'draft',
  submitted_data_json JSONB NOT NULL DEFAULT '{}',
  approved_data_json JSONB,
  rejected_reason VARCHAR(1000),
  submitted_at TIMESTAMPTZ,
  reviewed_by UUID,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_self_onboarding_employee ON employee.employee_self_onboarding_submissions(employee_id, status);
CREATE INDEX idx_self_onboarding_company ON employee.employee_self_onboarding_submissions(company_id, status);

CREATE TABLE employee.employee_self_onboarding_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id UUID NOT NULL REFERENCES employee.employee_self_onboarding_submissions(id),
  employee_id UUID NOT NULL REFERENCES employee.employees(id),
  document_type employee.self_onboarding_document_type NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  mime_type VARCHAR(120),
  storage_key VARCHAR(512) NOT NULL,
  size_bytes INT,
  status employee.self_onboarding_document_status NOT NULL DEFAULT 'uploaded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_self_onboarding_docs_submission ON employee.employee_self_onboarding_documents(submission_id);
CREATE INDEX idx_self_onboarding_docs_employee ON employee.employee_self_onboarding_documents(employee_id);
