-- ============================================================================
-- Marketing Daily Reports — source of truth for marketing KPI
-- ============================================================================

CREATE SCHEMA IF NOT EXISTS marketing;

CREATE TYPE marketing.daily_report_status AS ENUM (
    'draft',
    'submitted',
    'approved',
    'rejected',
    'voided'
);

CREATE TABLE marketing.daily_reports (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES organization.companies(id),
    employee_id         UUID NOT NULL REFERENCES employee.employees(id),
    report_date         DATE NOT NULL,
    contacted_count     INT NOT NULL DEFAULT 0,
    new_member_count    INT NOT NULL DEFAULT 0,
    deposit_amount      NUMERIC(14, 2) NOT NULL DEFAULT 0,
    started_work_count  INT NOT NULL DEFAULT 0,
    note                TEXT,
    status              marketing.daily_report_status NOT NULL DEFAULT 'draft',
    submitted_at        TIMESTAMPTZ,
    approved_by         UUID REFERENCES permission.users(id),
    approved_at         TIMESTAMPTZ,
    rejected_reason     TEXT,
    void_reason         TEXT,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID,
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID,
    CONSTRAINT chk_marketing_daily_counts_nonneg CHECK (
        contacted_count >= 0
        AND new_member_count >= 0
        AND deposit_amount >= 0
        AND started_work_count >= 0
    )
);

CREATE UNIQUE INDEX uq_marketing_daily_report_active
    ON marketing.daily_reports (company_id, employee_id, report_date)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_daily_report_employee
    ON marketing.daily_reports (employee_id, report_date)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_daily_report_company_date
    ON marketing.daily_reports (company_id, report_date, status)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_marketing_daily_reports_updated
    BEFORE UPDATE ON marketing.daily_reports
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
