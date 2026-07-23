-- ============================================================================
-- Admin Commission — additive tables + payroll source ref type
-- ============================================================================

ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'admin_commission';

CREATE TYPE commission.admin_office_type AS ENUM ('front_office', 'back_office');
CREATE TYPE commission.admin_shift_type AS ENUM ('day', 'night');
CREATE TYPE commission.admin_cycle_status AS ENUM ('calculated', 'finalized');
CREATE TYPE commission.admin_member_status AS ENUM ('pending_pay', 'paid', 'no_payout');
CREATE TYPE commission.admin_redistribution_type AS ENUM ('leave_penalty');

CREATE TABLE commission.admin_commission_employee_profiles (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES organization.companies(id),
    employee_id     UUID NOT NULL REFERENCES employee.employees(id),
    office_type     commission.admin_office_type NOT NULL,
    default_shift   commission.admin_shift_type NOT NULL DEFAULT 'day',
    is_active       BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT uq_admin_commission_profile UNIQUE (company_id, employee_id)
);

CREATE INDEX ix_admin_commission_profile_co ON commission.admin_commission_employee_profiles (company_id, is_active);

CREATE TABLE commission.admin_commission_shift_segments (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES organization.companies(id),
    employee_id     UUID NOT NULL REFERENCES employee.employees(id),
    earn_cycle_id   UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
    shift           commission.admin_shift_type NOT NULL,
    segment_start   DATE NOT NULL,
    segment_end     DATE NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID
);

CREATE INDEX ix_admin_shift_segment_co ON commission.admin_commission_shift_segments (company_id, earn_cycle_id);
CREATE INDEX ix_admin_shift_segment_emp ON commission.admin_commission_shift_segments (employee_id, earn_cycle_id);

CREATE TABLE commission.admin_commission_cycles (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id          UUID NOT NULL REFERENCES organization.companies(id),
    earn_cycle_id       UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
    pay_cycle_id        UUID REFERENCES payroll.payroll_cycles(id),
    net_profit          NUMERIC(14,2) NOT NULL,
    admin_pool          NUMERIC(14,2) NOT NULL,
    pool_a              NUMERIC(14,2) NOT NULL,
    pool_b              NUMERIC(14,2) NOT NULL,
    total_penalties     NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_redistributed NUMERIC(14,2) NOT NULL DEFAULT 0,
    total_payable       NUMERIC(14,2) NOT NULL DEFAULT 0,
    front_office_total  NUMERIC(14,2) NOT NULL DEFAULT 0,
    back_office_total   NUMERIC(14,2) NOT NULL DEFAULT 0,
    calculation_trace   JSONB NOT NULL,
    status              commission.admin_cycle_status NOT NULL DEFAULT 'calculated',
    finalized_at        TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID,
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID,
    CONSTRAINT uq_admin_commission_cycle UNIQUE (company_id, earn_cycle_id)
);

CREATE INDEX ix_admin_commission_cycle_co ON commission.admin_commission_cycles (company_id, status);

CREATE TABLE commission.admin_commission_member_results (
    id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id              UUID NOT NULL REFERENCES commission.admin_commission_cycles(id),
    employee_id           UUID NOT NULL REFERENCES employee.employees(id),
    office_type           commission.admin_office_type NOT NULL,
    days_worked_in_cycle  NUMERIC(8,2) NOT NULL,
    cycle_days            NUMERIC(8,2) NOT NULL,
    extra_leave_days      NUMERIC(8,2) NOT NULL DEFAULT 0,
    pool_a_share          NUMERIC(14,2) NOT NULL,
    pool_b_share          NUMERIC(14,2) NOT NULL,
    base_pool_amount      NUMERIC(14,2) NOT NULL,
    prorate_factor        NUMERIC(8,4) NOT NULL,
    prorated_base         NUMERIC(14,2) NOT NULL,
    penalty_rate          NUMERIC(8,4) NOT NULL DEFAULT 0,
    penalty_deduction     NUMERIC(14,2) NOT NULL DEFAULT 0,
    redistribution_bonus  NUMERIC(14,2) NOT NULL DEFAULT 0,
    final_payout          NUMERIC(14,2) NOT NULL DEFAULT 0,
    shift_segments        JSONB NOT NULL,
    status                commission.admin_member_status NOT NULL DEFAULT 'no_payout',
    payroll_item_id       UUID REFERENCES payroll.payroll_items(id),
    calculation_trace     JSONB NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    CONSTRAINT uq_admin_commission_member UNIQUE (cycle_id, employee_id)
);

CREATE INDEX ix_admin_commission_member_emp ON commission.admin_commission_member_results (employee_id);

CREATE TABLE commission.admin_commission_penalties (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id          UUID NOT NULL REFERENCES commission.admin_commission_cycles(id),
    member_result_id  UUID NOT NULL REFERENCES commission.admin_commission_member_results(id),
    employee_id       UUID NOT NULL REFERENCES employee.employees(id),
    extra_leave_days  NUMERIC(8,2) NOT NULL,
    penalty_rate      NUMERIC(8,4) NOT NULL,
    deducted_amount   NUMERIC(14,2) NOT NULL,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID
);

CREATE INDEX ix_admin_commission_penalty_cycle ON commission.admin_commission_penalties (cycle_id);

CREATE TABLE commission.admin_commission_redistributions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id                UUID NOT NULL REFERENCES commission.admin_commission_cycles(id),
    redistribution_type     commission.admin_redistribution_type NOT NULL,
    shift                   commission.admin_shift_type NOT NULL,
    source_member_result_id UUID REFERENCES commission.admin_commission_member_results(id),
    recipient_employee_id   UUID NOT NULL REFERENCES employee.employees(id),
    amount                  NUMERIC(14,2) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID
);

CREATE INDEX ix_admin_commission_redist_cycle ON commission.admin_commission_redistributions (cycle_id);
CREATE INDEX ix_admin_commission_redist_recipient ON commission.admin_commission_redistributions (recipient_employee_id);
