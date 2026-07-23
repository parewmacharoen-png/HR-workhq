-- ============================================================================
-- WorkHQ - Recruitment module extensions
-- Adds:
--   * Three new CandidateStage enum values: lead, started, passed_probation
--     (lead ≈ initial contact, started ≈ first day, passed_probation = final)
--   * Nine new columns on recruitment.candidates for full profile, offer,
--     interview scheduling, hire linkage, and cost-per-hire tracking
--   * recruitment.interviews  — multi-round interview session records
--   * recruitment.offers      — formal offer management with status lifecycle
--
-- Apply AFTER 20260101000400_performance_extensions.
-- All changes are ADDITIVE.
-- ============================================================================

-- ── Pipeline stage enum extensions ──────────────────────────────────────────
-- PostgreSQL ADD VALUE is non-transactional; safe for baseline migration.
ALTER TYPE recruitment.candidate_stage ADD VALUE IF NOT EXISTS 'lead';
ALTER TYPE recruitment.candidate_stage ADD VALUE IF NOT EXISTS 'started';
ALTER TYPE recruitment.candidate_stage ADD VALUE IF NOT EXISTS 'passed_probation';

-- ── Offer status enum ────────────────────────────────────────────────────────
CREATE TYPE recruitment.offer_status AS ENUM (
    'draft', 'sent', 'accepted', 'declined', 'expired', 'withdrawn'
);

-- ── Interview outcome enum ────────────────────────────────────────────────────
CREATE TYPE recruitment.interview_outcome AS ENUM (
    'scheduled', 'completed', 'passed', 'failed', 'no_show', 'cancelled'
);

-- ── Extend candidates table ──────────────────────────────────────────────────
ALTER TABLE recruitment.candidates
    ADD COLUMN IF NOT EXISTS email              VARCHAR(160),
    ADD COLUMN IF NOT EXISTS position           VARCHAR(160),
    ADD COLUMN IF NOT EXISTS notes              TEXT,
    ADD COLUMN IF NOT EXISTS interview_date     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS offer_amount       NUMERIC(14,2),
    ADD COLUMN IF NOT EXISTS offer_date         DATE,
    ADD COLUMN IF NOT EXISTS hired_at           TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS hired_employee_id  UUID REFERENCES employee.employees(id),
    ADD COLUMN IF NOT EXISTS cost_per_hire      NUMERIC(14,2);

CREATE INDEX IF NOT EXISTS ix_candidate_stage
    ON recruitment.candidates (company_id, stage) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS ix_candidate_hired_emp
    ON recruitment.candidates (hired_employee_id) WHERE hired_employee_id IS NOT NULL;

-- ── Interviews table ─────────────────────────────────────────────────────────
CREATE TABLE recruitment.interviews (
    id              UUID                          PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    UUID                          NOT NULL REFERENCES recruitment.candidates(id),
    company_id      UUID                          NOT NULL REFERENCES organization.companies(id),
    round           SMALLINT                      NOT NULL DEFAULT 1,
    scheduled_at    TIMESTAMPTZ                   NOT NULL,
    location        VARCHAR(200),
    interviewer_ids JSONB,  -- array of employee UUIDs
    outcome         recruitment.interview_outcome NOT NULL DEFAULT 'scheduled',
    score           NUMERIC(4,1),                 -- 0–10 interviewer rating
    notes           TEXT,
    completed_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ                   NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ                   NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT ck_interview_round CHECK (round >= 1),
    CONSTRAINT ck_interview_score CHECK (score IS NULL OR (score >= 0 AND score <= 10))
);
CREATE INDEX ix_interview_candidate ON recruitment.interviews (candidate_id);
CREATE INDEX ix_interview_company   ON recruitment.interviews (company_id, scheduled_at);
CREATE TRIGGER trg_interview_updated
    BEFORE UPDATE ON recruitment.interviews
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

-- ── Offers table ─────────────────────────────────────────────────────────────
CREATE TABLE recruitment.offers (
    id              UUID                      PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id    UUID                      NOT NULL REFERENCES recruitment.candidates(id),
    company_id      UUID                      NOT NULL REFERENCES organization.companies(id),
    position        VARCHAR(160)              NOT NULL,
    base_salary     NUMERIC(14,2)             NOT NULL,
    start_date      DATE,
    expiry_date     DATE                      NOT NULL,
    status          recruitment.offer_status  NOT NULL DEFAULT 'draft',
    terms           JSONB,                    -- additional offer terms (benefits, etc.)
    sent_at         TIMESTAMPTZ,
    responded_at    TIMESTAMPTZ,
    notes           TEXT,
    created_at      TIMESTAMPTZ               NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ               NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT ck_offer_salary   CHECK (base_salary > 0),
    CONSTRAINT ck_offer_expiry   CHECK (expiry_date >= CURRENT_DATE OR status IN ('accepted','declined','expired','withdrawn'))
);
CREATE INDEX ix_offer_candidate ON recruitment.offers (candidate_id);
CREATE INDEX ix_offer_company   ON recruitment.offers (company_id, status);
CREATE TRIGGER trg_offer_updated
    BEFORE UPDATE ON recruitment.offers
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
