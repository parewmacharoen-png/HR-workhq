-- ============================================================================
-- WorkHQ - Finance module extensions
-- Adds cost centers, budgets, and financial transactions (revenue/expense) to
-- the existing finance schema. The advance_requests, deposit_refunds, and
-- ledger_entries tables already exist from the init migration.
--
-- Apply AFTER 20260101000100_pg_features.
-- Conventions match the baseline: UUID PKs, created/updated/deleted audit
-- columns, soft delete, updated_at + (where relevant) append-only triggers.
-- ============================================================================

-- ---- Enums -----------------------------------------------------------------
CREATE TYPE finance.transaction_type AS ENUM ('revenue', 'expense');
CREATE TYPE finance.transaction_status AS ENUM
    ('draft', 'pending', 'approved', 'rejected', 'posted', 'void');
CREATE TYPE finance.budget_period AS ENUM ('monthly', 'quarterly', 'yearly');

-- ---- Cost centers ----------------------------------------------------------
CREATE TABLE finance.cost_centers (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID         NOT NULL REFERENCES organization.companies(id),
    code          VARCHAR(40)  NOT NULL,
    name          VARCHAR(160) NOT NULL,
    description   TEXT,
    parent_id     UUID         REFERENCES finance.cost_centers(id),
    owner_employee_id UUID     REFERENCES employee.employees(id),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);
CREATE UNIQUE INDEX uq_cost_center_company_code_live
    ON finance.cost_centers (company_id, code) WHERE deleted_at IS NULL;
CREATE INDEX ix_cost_center_company ON finance.cost_centers (company_id);
CREATE INDEX ix_cost_center_parent  ON finance.cost_centers (parent_id);
CREATE TRIGGER trg_cost_center_updated
    BEFORE UPDATE ON finance.cost_centers
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

-- ---- Budgets ---------------------------------------------------------------
CREATE TABLE finance.budgets (
    id              UUID                  PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID                  NOT NULL REFERENCES organization.companies(id),
    cost_center_id  UUID                  REFERENCES finance.cost_centers(id),
    name            VARCHAR(160)          NOT NULL,
    period          finance.budget_period NOT NULL DEFAULT 'monthly',
    period_start    DATE                  NOT NULL,
    period_end      DATE                  NOT NULL,
    amount          NUMERIC(14,2)         NOT NULL DEFAULT 0,
    consumed        NUMERIC(14,2)         NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ           NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ           NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT ck_budget_period   CHECK (period_end >= period_start),
    CONSTRAINT ck_budget_amount   CHECK (amount >= 0),
    CONSTRAINT ck_budget_consumed CHECK (consumed >= 0)
);
CREATE UNIQUE INDEX uq_budget_cc_period_live
    ON finance.budgets (company_id, cost_center_id, period_start)
    WHERE deleted_at IS NULL;
CREATE INDEX ix_budget_company ON finance.budgets (company_id);
CREATE INDEX ix_budget_cc      ON finance.budgets (cost_center_id);
CREATE TRIGGER trg_budget_updated
    BEFORE UPDATE ON finance.budgets
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

-- ---- Financial transactions (revenue / expense) ----------------------------
CREATE TABLE finance.financial_transactions (
    id                   UUID                       PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id           UUID                       NOT NULL REFERENCES organization.companies(id),
    cost_center_id       UUID                       REFERENCES finance.cost_centers(id),
    budget_id            UUID                       REFERENCES finance.budgets(id),
    type                 finance.transaction_type   NOT NULL,
    status               finance.transaction_status NOT NULL DEFAULT 'draft',
    category             VARCHAR(80),
    amount               NUMERIC(14,2)              NOT NULL,
    currency             VARCHAR(8)                 NOT NULL DEFAULT 'THB',
    transaction_date     DATE                       NOT NULL,
    description          TEXT,
    counterparty         VARCHAR(200),
    workflow_instance_id UUID                       REFERENCES workflow.workflow_instances(id),
    ledger_entry_id      UUID                       REFERENCES finance.ledger_entries(id),
    created_at           TIMESTAMPTZ                NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ                NOT NULL DEFAULT now(),
    created_by           UUID,
    updated_by           UUID,
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID,
    CONSTRAINT ck_fin_txn_amount CHECK (amount > 0)
);
CREATE INDEX ix_fin_txn_company_date ON finance.financial_transactions (company_id, transaction_date);
CREATE INDEX ix_fin_txn_cost_center  ON finance.financial_transactions (cost_center_id);
CREATE INDEX ix_fin_txn_type_status  ON finance.financial_transactions (type, status);
CREATE INDEX ix_fin_txn_budget       ON finance.financial_transactions (budget_id);
CREATE TRIGGER trg_fin_txn_updated
    BEFORE UPDATE ON finance.financial_transactions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
