-- EXPORT-001 / IMPORT-001 / EXPORT-002 — Data Exchange Platform

CREATE TYPE system.export_format AS ENUM ('google_sheets', 'pdf', 'csv', 'xlsx');
CREATE TYPE system.export_mode AS ENUM ('create_spreadsheet', 'append_worksheet', 'replace_worksheet');
CREATE TYPE system.export_job_status AS ENUM ('pending', 'running', 'completed', 'failed', 'cancelled');
CREATE TYPE system.import_source_type AS ENUM ('google_sheets', 'csv', 'xlsx');
CREATE TYPE system.import_job_status AS ENUM (
  'uploaded', 'parsing', 'validating', 'preview_ready', 'failed_validation',
  'ready_to_apply', 'applying', 'completed', 'failed', 'cancelled'
);
CREATE TYPE system.import_row_status AS ENUM ('valid', 'invalid', 'applied', 'failed', 'skipped');
CREATE TYPE system.export_share_mode AS ENUM ('private', 'owner', 'owner_secretary', 'selected_employees');

CREATE TABLE system.export_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(80) NOT NULL,
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  requested_by UUID NOT NULL,
  format system.export_format NOT NULL,
  mode system.export_mode NOT NULL DEFAULT 'create_spreadsheet',
  share_mode system.export_share_mode NOT NULL DEFAULT 'owner_secretary',
  google_spreadsheet_id VARCHAR(128),
  google_worksheet_id VARCHAR(64),
  google_sheet_url VARCHAR(512),
  file_name VARCHAR(256),
  storage_key VARCHAR(512),
  row_count INT NOT NULL DEFAULT 0,
  filters_json JSONB,
  columns_json JSONB,
  status system.export_job_status NOT NULL DEFAULT 'pending',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX export_jobs_company_created_idx ON system.export_jobs (company_id, created_at DESC);
CREATE INDEX export_jobs_status_idx ON system.export_jobs (status);

CREATE TABLE system.import_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(80) NOT NULL,
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  requested_by UUID NOT NULL,
  source_type system.import_source_type NOT NULL,
  source_url VARCHAR(512),
  file_name VARCHAR(256),
  storage_key VARCHAR(512),
  status system.import_job_status NOT NULL DEFAULT 'uploaded',
  total_rows INT NOT NULL DEFAULT 0,
  valid_rows INT NOT NULL DEFAULT 0,
  invalid_rows INT NOT NULL DEFAULT 0,
  applied_rows INT NOT NULL DEFAULT 0,
  failed_rows INT NOT NULL DEFAULT 0,
  mapping_json JSONB,
  validation_summary_json JSONB,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  failed_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX import_jobs_company_created_idx ON system.import_jobs (company_id, created_at DESC);
CREATE INDEX import_jobs_status_idx ON system.import_jobs (status);

CREATE TABLE system.import_row_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  import_job_id UUID NOT NULL REFERENCES system.import_jobs(id) ON DELETE CASCADE,
  row_number INT NOT NULL,
  status system.import_row_status NOT NULL,
  raw_json JSONB NOT NULL,
  normalized_json JSONB,
  errors_json JSONB,
  warnings_json JSONB,
  target_entity_type VARCHAR(80),
  target_entity_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX import_row_results_job_idx ON system.import_row_results (import_job_id, row_number);

CREATE TABLE system.scheduled_exports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  module VARCHAR(80) NOT NULL,
  format system.export_format NOT NULL DEFAULT 'google_sheets',
  schedule_cron VARCHAR(64) NOT NULL,
  timezone VARCHAR(64) NOT NULL DEFAULT 'Asia/Bangkok',
  filters_json JSONB,
  recipients_json JSONB,
  share_mode system.export_share_mode NOT NULL DEFAULT 'owner_secretary',
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX scheduled_exports_company_enabled_idx ON system.scheduled_exports (company_id, enabled);
