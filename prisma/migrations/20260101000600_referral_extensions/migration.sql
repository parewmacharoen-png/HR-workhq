-- ============================================================================
-- WorkHQ - Referral module extensions
-- Adds:
--   * candidate_id column on referral.referrals — links a referral to the
--     candidate record in the recruitment module (optional; populated when
--     the referred person was tracked through the recruitment pipeline)
--   * notes column on referral.referrals — for HR comments on qualification
--   * referral.referral_duplicate_checks — immutable audit log of every
--     duplicate-detection check performed, recording which signal matched and
--     what the outcome was. Keeps the duplicate detection process fully auditable.
--
-- Apply AFTER 20260101000500_recruitment_extensions.
-- All changes are ADDITIVE; existing constraint uq_referral_referred_live is
-- preserved (prevents the same referred_employee from receiving two rewards).
-- ============================================================================

-- ── Extend referrals table ───────────────────────────────────────────────────
ALTER TABLE referral.referrals
    ADD COLUMN IF NOT EXISTS candidate_id UUID
        REFERENCES recruitment.candidates(id),
    ADD COLUMN IF NOT EXISTS notes TEXT,
    ADD COLUMN IF NOT EXISTS rejection_reason VARCHAR(255);

CREATE INDEX IF NOT EXISTS ix_referral_candidate
    ON referral.referrals (candidate_id) WHERE candidate_id IS NOT NULL;

-- ── Duplicate detection check type ──────────────────────────────────────────
CREATE TYPE referral.duplicate_check_signal AS ENUM (
    'phone',
    'national_id',
    'bank_account'
);

-- ── Referral duplicate checks (append-only) ──────────────────────────────────
-- Records every duplicate-detection evaluation. Immutable: a trigger blocks
-- UPDATE and DELETE so the audit trail cannot be altered.
CREATE TABLE referral.referral_duplicate_checks (
    id               UUID                            PRIMARY KEY DEFAULT gen_random_uuid(),
    referral_id      UUID                            NOT NULL REFERENCES referral.referrals(id),
    checked_at       TIMESTAMPTZ                     NOT NULL DEFAULT now(),
    checked_by       UUID                            REFERENCES permission.users(id),
    signal           referral.duplicate_check_signal NOT NULL,
    match_found      BOOLEAN                         NOT NULL,
    match_detail     VARCHAR(255),   -- masked value that matched (e.g. last4 of phone)
    created_at       TIMESTAMPTZ                     NOT NULL DEFAULT now()
);

CREATE INDEX ix_dup_check_referral ON referral.referral_duplicate_checks (referral_id);

CREATE TRIGGER trg_dup_check_immutable
    BEFORE UPDATE OR DELETE ON referral.referral_duplicate_checks
    FOR EACH ROW EXECUTE FUNCTION system.forbid_mutation();
