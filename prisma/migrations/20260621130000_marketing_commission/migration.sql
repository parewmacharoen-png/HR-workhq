-- ============================================================================
-- Marketing Commission — additive tables + payroll source ref type
-- ============================================================================

ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'marketing_commission';

CREATE TYPE commission.marketing_cycle_status AS ENUM ('calculated', 'finalized');
CREATE TYPE commission.marketing_member_status AS ENUM ('pending_pay', 'paid', 'carried_forward', 'no_payout');
CREATE TYPE commission.marketing_carry_status AS ENUM ('pending', 'recovered', 'expired');
CREATE TYPE commission.marketing_redistribution_type AS ENUM ('ramp_difference', 'expired_carry');

CREATE TABLE commission.marketing_commission_cycles (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID NOT NULL REFERENCES organization.companies(id),
    team_id                     UUID NOT NULL REFERENCES organization.teams(id),
    earn_cycle_id               UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
    pay_cycle_id                UUID REFERENCES payroll.payroll_cycles(id),
    gross_profit                NUMERIC(14,2) NOT NULL,
    employee_salary_expense     NUMERIC(14,2) NOT NULL,
    marketing_expense           NUMERIC(14,2) NOT NULL,
    line_expense                NUMERIC(14,2) NOT NULL,
    telesales_expense           NUMERIC(14,2) NOT NULL,
    promotion_expense           NUMERIC(14,2) NOT NULL DEFAULT 0,
    profit_after_expenses       NUMERIC(14,2) NOT NULL,
    company_head_deduction      NUMERIC(14,2) NOT NULL,
    net_profit                  NUMERIC(14,2) NOT NULL,
    team_commission_pool        NUMERIC(14,2) NOT NULL,
    leader_base                 NUMERIC(14,2) NOT NULL,
    big_leader_employee_id      UUID REFERENCES employee.employees(id),
    big_leader_commission       NUMERIC(14,2) NOT NULL DEFAULT 0,
    big_leader_payroll_item_id  UUID REFERENCES payroll.payroll_items(id),
    calculation_trace           JSONB NOT NULL,
    status                      commission.marketing_cycle_status NOT NULL DEFAULT 'calculated',
    finalized_at                TIMESTAMPTZ,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  UUID,
    updated_by                  UUID,
    deleted_at                  TIMESTAMPTZ,
    deleted_by                  UUID,
    CONSTRAINT uq_marketing_commission_cycle UNIQUE (company_id, team_id, earn_cycle_id)
);

CREATE INDEX ix_marketing_commission_cycle_co ON commission.marketing_commission_cycles (company_id, status);

CREATE TABLE commission.marketing_commission_member_results (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id                UUID NOT NULL REFERENCES commission.marketing_commission_cycles(id),
    employee_id             UUID NOT NULL REFERENCES employee.employees(id),
    role_level              organization.role_level NOT NULL,
    achieved_candidates     NUMERIC(10,2) NOT NULL DEFAULT 0,
    target_candidates       NUMERIC(10,2) NOT NULL DEFAULT 24,
    kpi_qualified           BOOLEAN NOT NULL DEFAULT FALSE,
    kpi_exempt              BOOLEAN NOT NULL DEFAULT FALSE,
    tenure_month            INT NOT NULL,
    ramp_percent            NUMERIC(6,4) NOT NULL,
    ramp_override_percent   NUMERIC(6,4),
    member_count            INT NOT NULL,
    base_share              NUMERIC(14,2) NOT NULL,
    ramped_amount           NUMERIC(14,2) NOT NULL,
    redistribution_bonus    NUMERIC(14,2) NOT NULL DEFAULT 0,
    pool_payout             NUMERIC(14,2) NOT NULL,
    carry_forward_in        NUMERIC(14,2) NOT NULL DEFAULT 0,
    carry_forward_out       NUMERIC(14,2) NOT NULL DEFAULT 0,
    carry_expired           NUMERIC(14,2) NOT NULL DEFAULT 0,
    final_payout            NUMERIC(14,2) NOT NULL DEFAULT 0,
    status                  commission.marketing_member_status NOT NULL DEFAULT 'no_payout',
    payroll_item_id         UUID REFERENCES payroll.payroll_items(id),
    calculation_trace       JSONB NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID,
    updated_by              UUID,
    CONSTRAINT uq_marketing_member_cycle UNIQUE (cycle_id, employee_id)
);

CREATE INDEX ix_marketing_member_employee ON commission.marketing_commission_member_results (employee_id);

CREATE TABLE commission.marketing_commission_carry_forwards (
    id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id                  UUID NOT NULL REFERENCES organization.companies(id),
    team_id                     UUID NOT NULL REFERENCES organization.teams(id),
    employee_id                 UUID NOT NULL REFERENCES employee.employees(id),
    source_cycle_id             UUID NOT NULL REFERENCES commission.marketing_commission_cycles(id),
    source_member_result_id     UUID NOT NULL REFERENCES commission.marketing_commission_member_results(id),
    amount                      NUMERIC(14,2) NOT NULL,
    status                      commission.marketing_carry_status NOT NULL DEFAULT 'pending',
    recovered_cycle_id          UUID,
    recovered_member_result_id  UUID REFERENCES commission.marketing_commission_member_results(id),
    expired_cycle_id            UUID,
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  UUID,
    updated_by                  UUID,
    deleted_at                  TIMESTAMPTZ,
    deleted_by                  UUID
);

CREATE INDEX ix_marketing_carry_emp ON commission.marketing_commission_carry_forwards (employee_id, status);
CREATE INDEX ix_marketing_carry_team ON commission.marketing_commission_carry_forwards (team_id, status);

CREATE TABLE commission.marketing_commission_redistributions (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    cycle_id                UUID NOT NULL REFERENCES commission.marketing_commission_cycles(id),
    redistribution_type     commission.marketing_redistribution_type NOT NULL,
    source_member_result_id UUID REFERENCES commission.marketing_commission_member_results(id),
    recipient_employee_id   UUID NOT NULL REFERENCES employee.employees(id),
    amount                  NUMERIC(14,2) NOT NULL,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID,
    CONSTRAINT ck_marketing_redis_amount CHECK (amount >= 0)
);

CREATE INDEX ix_marketing_redis_cycle ON commission.marketing_commission_redistributions (cycle_id);
CREATE INDEX ix_marketing_redis_recipient ON commission.marketing_commission_redistributions (recipient_employee_id);
