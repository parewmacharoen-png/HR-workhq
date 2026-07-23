-- ============================================================================
-- Marketing Organization — marketing-specific team structure
-- ============================================================================

CREATE TYPE marketing.team_level AS ENUM ('root', 'sub_team');
CREATE TYPE marketing.team_member_role AS ENUM ('big_leader', 'sub_leader', 'member');

CREATE TABLE marketing.teams (
    id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID NOT NULL REFERENCES organization.companies(id),
    code                    VARCHAR(40) NOT NULL,
    name                    VARCHAR(120) NOT NULL,
    parent_team_id          UUID REFERENCES marketing.teams(id),
    level                   marketing.team_level NOT NULL,
    big_leader_employee_id  UUID REFERENCES employee.employees(id),
    sub_leader_employee_id  UUID REFERENCES employee.employees(id),
    is_active               BOOLEAN NOT NULL DEFAULT true,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID REFERENCES permission.users(id),
    updated_by              UUID REFERENCES permission.users(id),
    deleted_at              TIMESTAMPTZ,
    deleted_by              UUID REFERENCES permission.users(id)
);

CREATE UNIQUE INDEX uq_marketing_teams_code
    ON marketing.teams (company_id, code)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_teams_company
    ON marketing.teams (company_id)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_teams_parent
    ON marketing.teams (parent_team_id)
    WHERE deleted_at IS NULL;

CREATE TABLE marketing.team_members (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id      UUID NOT NULL REFERENCES organization.companies(id),
    team_id         UUID NOT NULL REFERENCES marketing.teams(id),
    employee_id     UUID NOT NULL REFERENCES employee.employees(id),
    role            marketing.team_member_role NOT NULL DEFAULT 'member',
    effective_from  DATE NOT NULL,
    effective_to    DATE,
    is_primary      BOOLEAN NOT NULL DEFAULT true,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID REFERENCES permission.users(id),
    updated_by      UUID REFERENCES permission.users(id),
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID REFERENCES permission.users(id)
);

CREATE INDEX ix_marketing_team_members_company_employee
    ON marketing.team_members (company_id, employee_id)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_team_members_team
    ON marketing.team_members (team_id)
    WHERE deleted_at IS NULL;

CREATE INDEX ix_marketing_team_members_effective
    ON marketing.team_members (employee_id, effective_to)
    WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX uq_marketing_team_members_primary_active
    ON marketing.team_members (company_id, employee_id)
    WHERE deleted_at IS NULL AND is_primary = true AND effective_to IS NULL;

CREATE TRIGGER trg_marketing_teams_updated
    BEFORE UPDATE ON marketing.teams
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_marketing_team_members_updated
    BEFORE UPDATE ON marketing.team_members
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

-- Repoint expense and commission team FKs to marketing.teams
-- Legacy rows reference organization.teams; clear before retargeting FK
UPDATE marketing.expenses SET team_id = NULL WHERE team_id IS NOT NULL;

DELETE FROM commission.marketing_commission_carry_forwards;
DELETE FROM commission.marketing_commission_redistributions;
DELETE FROM commission.marketing_commission_member_results;
DELETE FROM commission.marketing_commission_cycles;

ALTER TABLE marketing.expenses
    DROP CONSTRAINT IF EXISTS expenses_team_id_fkey;

ALTER TABLE commission.marketing_commission_cycles
    DROP CONSTRAINT IF EXISTS marketing_commission_cycles_team_id_fkey;

ALTER TABLE commission.marketing_commission_carry_forwards
    DROP CONSTRAINT IF EXISTS marketing_commission_carry_forwards_team_id_fkey;

ALTER TABLE marketing.expenses
    ADD CONSTRAINT expenses_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES marketing.teams(id);

ALTER TABLE commission.marketing_commission_cycles
    ADD CONSTRAINT marketing_commission_cycles_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES marketing.teams(id);

ALTER TABLE commission.marketing_commission_carry_forwards
    ADD CONSTRAINT marketing_commission_carry_forwards_team_id_fkey
    FOREIGN KEY (team_id) REFERENCES marketing.teams(id);
