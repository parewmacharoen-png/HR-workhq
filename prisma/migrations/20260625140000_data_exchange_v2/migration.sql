-- Data Exchange Platform v2 — templates, saved reports, async queue, import rollback, AI export

CREATE TYPE system.export_sync_mode AS ENUM ('none', 'manual', 'scheduled', 'live_sync');
ALTER TYPE system.export_job_status ADD VALUE IF NOT EXISTS 'queued' BEFORE 'running';
ALTER TYPE system.export_mode ADD VALUE IF NOT EXISTS 'live_sync';
ALTER TYPE system.import_job_status ADD VALUE IF NOT EXISTS 'mapping' BEFORE 'validating';
ALTER TYPE system.import_job_status ADD VALUE IF NOT EXISTS 'rolled_back';
CREATE TYPE system.import_duplicate_strategy AS ENUM ('skip', 'update', 'replace', 'merge');
CREATE TYPE system.report_template_status AS ENUM ('active', 'archived');
CREATE TYPE system.scheduled_export_schedule_type AS ENUM ('daily', 'weekly', 'monthly', 'quarterly', 'yearly', 'cron');
CREATE TYPE system.ai_export_request_status AS ENUM ('parsed', 'confirmed', 'exported', 'failed', 'cancelled');

ALTER TABLE system.export_jobs
  ADD COLUMN IF NOT EXISTS sync_mode system.export_sync_mode NOT NULL DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS report_template_id UUID,
  ADD COLUMN IF NOT EXISTS saved_report_id UUID,
  ADD COLUMN IF NOT EXISTS external_document_id VARCHAR(128),
  ADD COLUMN IF NOT EXISTS progress_percent INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_sync_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_sync_at TIMESTAMPTZ;

ALTER TABLE system.import_jobs
  ADD COLUMN IF NOT EXISTS duplicate_strategy system.import_duplicate_strategy NOT NULL DEFAULT 'skip',
  ADD COLUMN IF NOT EXISTS rollback_snapshot_json JSONB;

ALTER TABLE system.import_row_results
  ADD COLUMN IF NOT EXISTS before_json JSONB,
  ADD COLUMN IF NOT EXISTS after_json JSONB;

ALTER TABLE system.scheduled_exports
  ADD COLUMN IF NOT EXISTS saved_report_id UUID,
  ADD COLUMN IF NOT EXISTS report_template_id UUID,
  ADD COLUMN IF NOT EXISTS mode system.export_mode NOT NULL DEFAULT 'create_spreadsheet',
  ADD COLUMN IF NOT EXISTS schedule_type system.scheduled_export_schedule_type NOT NULL DEFAULT 'cron',
  ADD COLUMN IF NOT EXISTS columns_json JSONB;

CREATE TABLE IF NOT EXISTS system.report_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(80) NOT NULL,
  company_id UUID REFERENCES organization.companies(id),
  name VARCHAR(160) NOT NULL,
  description VARCHAR(512),
  columns_json JSONB NOT NULL,
  filters_json JSONB,
  sort_json JSONB,
  share_mode system.export_share_mode NOT NULL DEFAULT 'owner_secretary',
  is_system BOOLEAN NOT NULL DEFAULT false,
  status system.report_template_status NOT NULL DEFAULT 'active',
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS report_templates_module_status_idx ON system.report_templates(module, status);

CREATE TABLE IF NOT EXISTS system.saved_reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES organization.companies(id),
  module VARCHAR(80) NOT NULL,
  name VARCHAR(160) NOT NULL,
  description VARCHAR(512),
  template_id UUID REFERENCES system.report_templates(id),
  filters_json JSONB,
  columns_json JSONB,
  default_format system.export_format NOT NULL DEFAULT 'google_sheets',
  share_mode system.export_share_mode NOT NULL DEFAULT 'owner_secretary',
  is_favorite BOOLEAN NOT NULL DEFAULT false,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS saved_reports_company_module_idx ON system.saved_reports(company_id, module);

CREATE TABLE IF NOT EXISTS system.user_export_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  module VARCHAR(80) NOT NULL,
  selected_columns_json JSONB,
  filters_json JSONB,
  last_format system.export_format NOT NULL DEFAULT 'google_sheets',
  last_template_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, module)
);

CREATE TABLE IF NOT EXISTS system.import_mapping_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  module VARCHAR(80) NOT NULL,
  company_id UUID REFERENCES organization.companies(id),
  name VARCHAR(160) NOT NULL,
  mapping_json JSONB NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS import_mapping_templates_module_company_idx ON system.import_mapping_templates(module, company_id);

CREATE TABLE IF NOT EXISTS system.ai_export_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  requested_by UUID NOT NULL,
  company_id UUID NOT NULL REFERENCES organization.companies(id),
  prompt TEXT NOT NULL,
  parsed_module VARCHAR(80),
  parsed_filters_json JSONB,
  parsed_columns_json JSONB,
  status system.ai_export_request_status NOT NULL DEFAULT 'parsed',
  export_job_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_export_requests_company_created_idx ON system.ai_export_requests(company_id, created_at DESC);

ALTER TABLE system.export_jobs
  ADD CONSTRAINT export_jobs_report_template_fk FOREIGN KEY (report_template_id) REFERENCES system.report_templates(id),
  ADD CONSTRAINT export_jobs_saved_report_fk FOREIGN KEY (saved_report_id) REFERENCES system.saved_reports(id);

ALTER TABLE system.scheduled_exports
  ADD CONSTRAINT scheduled_exports_saved_report_fk FOREIGN KEY (saved_report_id) REFERENCES system.saved_reports(id),
  ADD CONSTRAINT scheduled_exports_report_template_fk FOREIGN KEY (report_template_id) REFERENCES system.report_templates(id);
