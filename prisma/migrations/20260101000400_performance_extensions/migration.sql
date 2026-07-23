-- ============================================================================
-- WorkHQ - Performance module extensions
-- Adds new enums and columns to support:
--   * Grade A/B/C/D/F (performance.performance_grade enum + grade column)
--   * Promotion readiness recommendation (promotion_readiness enum + column)
--   * Salary review recommendation (salary_review_recommendation enum + column)
--   * Formula version provenance (formula_version_id FK)
--   * Workflow integration (workflow_instance_id FK)
--   * Probation outcome tracking (probation_outcome enum + column)
--
-- Apply AFTER 20260101000300_reporting_extensions.
-- All changes are ADDITIVE (no existing columns modified).
-- ============================================================================

-- ── New enum types ──────────────────────────────────────────────────────────
CREATE TYPE performance.performance_grade AS ENUM ('A', 'B', 'C', 'D', 'F');

CREATE TYPE performance.promotion_readiness AS ENUM (
    'ready',
    'ready_with_conditions',
    'not_ready',
    'needs_review'
);

CREATE TYPE performance.salary_review_action AS ENUM (
    'increase',
    'maintain',
    'decrease',
    'freeze',
    'probation_extension'
);

CREATE TYPE performance.probation_outcome AS ENUM (
    'pending',
    'passed',
    'extended',
    'failed'
);

-- ── Extend evaluations table ─────────────────────────────────────────────────
ALTER TABLE performance.evaluations
    ADD COLUMN IF NOT EXISTS grade
        performance.performance_grade,
    ADD COLUMN IF NOT EXISTS promotion_readiness
        performance.promotion_readiness,
    ADD COLUMN IF NOT EXISTS salary_review_recommendation
        performance.salary_review_action,
    ADD COLUMN IF NOT EXISTS salary_increase_pct
        NUMERIC(6,2),
    ADD COLUMN IF NOT EXISTS promotion_notes
        TEXT,
    ADD COLUMN IF NOT EXISTS workflow_instance_id
        UUID REFERENCES workflow.workflow_instances(id),
    ADD COLUMN IF NOT EXISTS formula_version_id
        UUID REFERENCES system.formula_versions(id);

CREATE INDEX IF NOT EXISTS ix_eval_grade
    ON performance.evaluations (grade) WHERE grade IS NOT NULL;

CREATE INDEX IF NOT EXISTS ix_eval_workflow
    ON performance.evaluations (workflow_instance_id) WHERE workflow_instance_id IS NOT NULL;

-- ── Probation tracking table ─────────────────────────────────────────────────
-- Separate table so we track every probation event (possible multiple per
-- employee if they have re-hires) without polluting the main evaluation row.
CREATE TABLE performance.probation_reviews (
    id                   UUID                         PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id          UUID                         NOT NULL REFERENCES employee.employees(id),
    company_id           UUID                         NOT NULL REFERENCES organization.companies(id),
    evaluation_id        UUID                         REFERENCES performance.evaluations(id),
    probation_start_date DATE                         NOT NULL,
    probation_end_date   DATE                         NOT NULL,
    outcome              performance.probation_outcome NOT NULL DEFAULT 'pending',
    extended_until       DATE,
    notes                TEXT,
    reviewed_by          UUID                         REFERENCES permission.users(id),
    reviewed_at          TIMESTAMPTZ,
    created_at           TIMESTAMPTZ                  NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ                  NOT NULL DEFAULT now(),
    created_by           UUID,
    updated_by           UUID,
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID,
    CONSTRAINT ck_probation_dates CHECK (probation_end_date >= probation_start_date),
    CONSTRAINT ck_probation_extension
        CHECK (extended_until IS NULL OR extended_until > probation_end_date)
);

CREATE INDEX ix_probation_employee
    ON performance.probation_reviews (employee_id);
CREATE INDEX ix_probation_company_outcome
    ON performance.probation_reviews (company_id, outcome);
CREATE TRIGGER trg_probation_updated
    BEFORE UPDATE ON performance.probation_reviews
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
