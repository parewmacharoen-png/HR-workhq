-- ============================================================================
-- Marketing Expenses — system-managed marketing expense tracking
-- ============================================================================

CREATE TYPE marketing.expense_category AS ENUM (
    'advertising',
    'deposit',
    'worker_payment',
    'worker_bonus',
    'team_operation',
    'shared_expense',
    'line_oa',
    'telesales',
    'promotion',
    'other'
);

CREATE TYPE marketing.expense_status AS ENUM (
    'draft',
    'submitted',
    'approved',
    'rejected',
    'voided'
);

CREATE TABLE marketing.expenses (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id       UUID NOT NULL REFERENCES organization.companies(id),
    team_id          UUID REFERENCES organization.teams(id),
    employee_id      UUID REFERENCES employee.employees(id),
    earn_cycle_id    UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
    expense_date     DATE NOT NULL,
    category         marketing.expense_category NOT NULL,
    sub_category     TEXT,
    amount           NUMERIC(14, 2) NOT NULL DEFAULT 0,
    description      TEXT,
    attachment_url   TEXT,
    status           marketing.expense_status NOT NULL DEFAULT 'draft',
    submitted_by     UUID REFERENCES permission.users(id),
    approved_by      UUID REFERENCES permission.users(id),
    approved_at      TIMESTAMPTZ,
    rejected_reason  TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID REFERENCES permission.users(id),
    updated_by       UUID REFERENCES permission.users(id),
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID REFERENCES permission.users(id)
);

CREATE INDEX ix_marketing_expenses_company_cycle
    ON marketing.expenses (company_id, earn_cycle_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_expenses_team_cycle
    ON marketing.expenses (company_id, team_id, earn_cycle_id, status)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_expenses_employee
    ON marketing.expenses (employee_id, expense_date DESC)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_expenses_date
    ON marketing.expenses (company_id, expense_date DESC)
    WHERE deleted_at IS NULL;

CREATE TRIGGER trg_marketing_expenses_updated
    BEFORE UPDATE ON marketing.expenses
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
