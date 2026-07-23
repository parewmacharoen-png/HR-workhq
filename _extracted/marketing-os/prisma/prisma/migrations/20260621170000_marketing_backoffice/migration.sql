-- ============================================================================
-- Marketing Back Office — audit trail + cycle locking
-- ============================================================================

CREATE TYPE marketing.report_audit_action AS ENUM (
    'create',
    'update',
    'submit',
    'approve',
    'reject',
    'void',
    'lock',
    'unlock'
);

CREATE TYPE marketing.cycle_lock_status AS ENUM (
    'unlocked',
    'locked'
);

CREATE TABLE marketing.report_audit_logs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID NOT NULL REFERENCES organization.companies(id),
    report_id    UUID NOT NULL REFERENCES marketing.daily_reports(id),
    actor_id     UUID NOT NULL REFERENCES permission.users(id),
    action       marketing.report_audit_action NOT NULL,
    field_name   TEXT,
    old_value    TEXT,
    new_value    TEXT,
    reason       TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_marketing_report_audit_report
    ON marketing.report_audit_logs (report_id, created_at DESC);

CREATE INDEX ix_marketing_report_audit_company
    ON marketing.report_audit_logs (company_id, created_at DESC);

CREATE INDEX ix_marketing_report_audit_actor
    ON marketing.report_audit_logs (actor_id, created_at DESC);

CREATE TABLE marketing.cycle_locks (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES organization.companies(id),
    earn_cycle_id   UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
    status          marketing.cycle_lock_status NOT NULL DEFAULT 'unlocked',
    locked_by       UUID REFERENCES permission.users(id),
    locked_at       TIMESTAMPTZ,
    lock_reason     TEXT,
    unlocked_by     UUID REFERENCES permission.users(id),
    unlocked_at     TIMESTAMPTZ,
    unlock_reason   TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_marketing_cycle_lock UNIQUE (company_id, earn_cycle_id)
);

CREATE INDEX ix_marketing_cycle_lock_status
    ON marketing.cycle_locks (company_id, status);

CREATE TRIGGER trg_marketing_cycle_locks_updated
    BEFORE UPDATE ON marketing.cycle_locks
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
