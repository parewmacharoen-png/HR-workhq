-- ============================================================================
-- WorkHQ - Initial migration
-- Extensions, schemas, enum types, tables (inline CHECK / UNIQUE / FK /
-- EXCLUDE constraints), plain (non-partial) indexes, and deferred-FK ALTERs.
--
-- NOTE on EXCLUDE constraints: ex_salary_no_overlap and ex_formula_no_overlap
-- are defined INLINE in their CREATE TABLE statements below. They are valid
-- PostgreSQL and execute correctly here, but Prisma's schema language cannot
-- model them -- see the migration README for how to suppress drift warnings.
--
-- PostgreSQL-only objects that Prisma cannot represent at all (trigger
-- functions, triggers, partial unique indexes, pgvector HNSW index) live in
-- the sibling migration 20260101000100_pg_features and MUST run AFTER this one.
--
-- This is the validated DDL (ran clean on PostgreSQL 16.14, ON_ERROR_STOP=1).
-- Prisma's migrate engine executes it verbatim; it is not auto-generated.
-- ============================================================================

-- ============================================================================
-- WorkHQ — Production DDL (PostgreSQL 16)
-- Phase 3: Foundation — extensions, shared functions, enums
-- ============================================================================
-- Conventions:
--   * UUID PKs via gen_random_uuid() (pgcrypto)
--   * created_at / updated_at / deleted_at / deleted_by on business tables
--   * audit_logs is append-only (BIGSERIAL, immutable)
--   * Money: NUMERIC(14,2); rates/ratios: NUMERIC(10,4)
--   * Partial unique indexes guard uniqueness only for live rows
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;     -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS btree_gist;   -- EXCLUDE constraints (no-overlap)
CREATE EXTENSION IF NOT EXISTS vector;        -- pgvector for AI embeddings

-- ---------------------------------------------------------------------------
-- Schemas (logical domains)
-- ---------------------------------------------------------------------------
CREATE SCHEMA IF NOT EXISTS organization;

CREATE SCHEMA IF NOT EXISTS employee;

CREATE SCHEMA IF NOT EXISTS permission;

CREATE SCHEMA IF NOT EXISTS attendance;

CREATE SCHEMA IF NOT EXISTS leave;

CREATE SCHEMA IF NOT EXISTS workflow;

CREATE SCHEMA IF NOT EXISTS payroll;

CREATE SCHEMA IF NOT EXISTS commission;

CREATE SCHEMA IF NOT EXISTS finance;

CREATE SCHEMA IF NOT EXISTS performance;

CREATE SCHEMA IF NOT EXISTS recruitment;

CREATE SCHEMA IF NOT EXISTS referral;

CREATE SCHEMA IF NOT EXISTS training;

CREATE SCHEMA IF NOT EXISTS assets;

CREATE SCHEMA IF NOT EXISTS knowledge;

CREATE SCHEMA IF NOT EXISTS ai;

CREATE SCHEMA IF NOT EXISTS reporting;

CREATE SCHEMA IF NOT EXISTS telegram;

CREATE SCHEMA IF NOT EXISTS system;

-- ============================================================================
-- ENUM TYPES (grouped by domain)
-- ============================================================================

-- employee
CREATE TYPE employee.employment_status AS ENUM
    ('probation','active','suspended','terminated');

CREATE TYPE employee.document_type AS ENUM
    ('contract','national_id','certificate','resume','other');

-- organization / assignment
CREATE TYPE organization.role_level AS ENUM
    ('employee','sub_leader','big_leader');

-- permission
CREATE TYPE permission.user_type AS ENUM ('human','system','ai');

CREATE TYPE permission.scope_type AS ENUM ('all','company','team','self');

CREATE TYPE permission.surface AS ENUM ('telegram','web');

-- attendance
CREATE TYPE attendance.record_status AS ENUM
    ('present','absent','incomplete','corrected');

CREATE TYPE attendance.record_source AS ENUM ('telegram','web','correction');

CREATE TYPE attendance.reminder_type AS ENUM
    ('break_start','break_end','missing_checkin','missing_checkout');

CREATE TYPE attendance.approval_status AS ENUM
    ('pending','approved','rejected');

-- leave
CREATE TYPE leave.accrual_period AS ENUM ('payroll_cycle','year','half_year');

CREATE TYPE leave.request_status AS ENUM
    ('pending','approved','rejected','returned');

-- workflow
CREATE TYPE workflow.entity_type AS ENUM
    ('leave','attendance_correction','overtime','payroll_adjustment',
     'bonus','commission_adjustment','deposit_refund','advance','performance_review');

CREATE TYPE workflow.approver_rule AS ENUM
    ('sub_leader','big_leader','hr','finance','owner','role');

CREATE TYPE workflow.instance_status AS ENUM
    ('pending','approved','rejected','returned','escalated','cancelled');

CREATE TYPE workflow.action_type AS ENUM
    ('approve','reject','return','escalate','override','cancel');

-- payroll
CREATE TYPE payroll.cycle_status AS ENUM ('open','locked','paid');

CREATE TYPE payroll.item_type AS ENUM
    ('salary','ot','meal_allowance','cross_border','bonus','commission',
     'referral','deposit','manual_adjustment');

CREATE TYPE payroll.source_ref_type AS ENUM
    ('overtime','commission','referral','holiday_conversion','deposit',
     'advance','manual');

-- commission
CREATE TYPE commission.metric AS ENUM ('unique_candidates');

CREATE TYPE commission.record_status AS ENUM
    ('accrued','hold','redistributed','paid');

CREATE TYPE commission.hold_resolution AS ENUM
    ('released','redistributed','pending');

-- finance
CREATE TYPE finance.request_status AS ENUM
    ('pending','approved','rejected','recovered','refunded');

CREATE TYPE finance.ledger_direction AS ENUM ('debit','credit');

-- performance
CREATE TYPE performance.cycle_status AS ENUM ('open','locked','finalized');

CREATE TYPE performance.dimension AS ENUM
    ('attendance','recruitment','discipline','manager_review','owner_review');

CREATE TYPE performance.eval_status AS ENUM ('draft','submitted','finalized');

CREATE TYPE performance.scorer AS ENUM ('system','manager','owner','ai');

-- recruitment
CREATE TYPE recruitment.candidate_stage AS ENUM
    ('new','screened','interview','offer','hired','rejected');

-- referral
CREATE TYPE referral.qualifying_condition AS ENUM
    ('probation_pass','three_months');

CREATE TYPE referral.referral_status AS ENUM
    ('pending','qualified','paid','rejected');

-- training
CREATE TYPE training.assignment_status AS ENUM
    ('assigned','in_progress','completed','overdue');

-- assets
CREATE TYPE assets.asset_status AS ENUM
    ('available','assigned','maintenance','retired');

-- ai
CREATE TYPE ai.message_role AS ENUM ('user','assistant','system','tool');

CREATE TYPE ai.channel AS ENUM ('telegram','web');

-- reporting
CREATE TYPE reporting.snapshot_type AS ENUM
    ('morning_brief','evening_brief','executive','profit','forecast','risk');

-- telegram
CREATE TYPE telegram.direction AS ENUM ('inbound','outbound');

-- system / formula
CREATE TYPE system.formula_return_type AS ENUM ('number','money','boolean');

CREATE TYPE system.job_status AS ENUM ('running','success','failed');

CREATE TYPE system.backup_type AS ENUM ('full','incremental');

-- ============================================================================
-- DOMAIN 1: ORGANIZATION
-- ============================================================================

CREATE TABLE organization.companies (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(8)   NOT NULL,
    name          VARCHAR(120) NOT NULL,
    legal_name    VARCHAR(200),
    timezone      VARCHAR(40)  NOT NULL DEFAULT 'Asia/Bangkok',
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE TABLE organization.functions (
    id            UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(40)  NOT NULL,
    name          VARCHAR(120) NOT NULL,
    description   TEXT,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

-- teams references employee.employees (created later) for big_leader -> add FK after employees.
CREATE TABLE organization.teams (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id              UUID         NOT NULL REFERENCES organization.companies(id),
    function_id             UUID         REFERENCES organization.functions(id),
    name                    VARCHAR(120) NOT NULL,
    parent_team_id          UUID         REFERENCES organization.teams(id),
    big_leader_employee_id  UUID,  -- FK added after employee.employees exists
    is_active               BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by              UUID,
    updated_by              UUID,
    deleted_at              TIMESTAMPTZ,
    deleted_by              UUID
);

CREATE INDEX ix_teams_company   ON organization.teams (company_id);

CREATE INDEX ix_teams_parent    ON organization.teams (parent_team_id);

-- ============================================================================
-- DOMAIN 2: EMPLOYEE
-- ============================================================================

CREATE TABLE employee.employees (
    id                      UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
    global_id               VARCHAR(12)  NOT NULL,
    first_name              VARCHAR(100) NOT NULL,
    last_name               VARCHAR(100) NOT NULL,
    nickname                VARCHAR(60),
    national_id             VARCHAR(64),  -- encrypted at app layer
    phone                   VARCHAR(32),
    email                   VARCHAR(160),
    date_of_birth           DATE,
    hire_date               DATE         NOT NULL,
    probation_end_date      DATE,
    termination_date        DATE,
    employment_status       employee.employment_status NOT NULL DEFAULT 'probation',
    rehire_of_employee_id   UUID         REFERENCES employee.employees(id),
    created_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ  NOT NULL DEFAULT now(),
    created_by              UUID,
    updated_by              UUID,
    deleted_at              TIMESTAMPTZ,
    deleted_by              UUID,
    CONSTRAINT ck_employees_global_id_fmt CHECK (global_id ~ '^EMP[0-9]{6}$')
);

CREATE INDEX ix_employees_rehire ON employee.employees (rehire_of_employee_id);

CREATE INDEX ix_employees_status ON employee.employees (employment_status);

-- Deferred FK: teams.big_leader_employee_id -> employees.id
ALTER TABLE organization.teams
    ADD CONSTRAINT fk_teams_big_leader
    FOREIGN KEY (big_leader_employee_id) REFERENCES employee.employees(id);

CREATE TABLE employee.employee_assignments (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id          UUID        NOT NULL REFERENCES employee.employees(id),
    company_id           UUID        NOT NULL REFERENCES organization.companies(id),
    team_id              UUID        REFERENCES organization.teams(id),
    function_id          UUID        REFERENCES organization.functions(id),
    role_level           organization.role_level NOT NULL DEFAULT 'employee',
    is_primary_company   BOOLEAN     NOT NULL DEFAULT FALSE,
    is_primary_team      BOOLEAN     NOT NULL DEFAULT FALSE,
    effective_from       DATE        NOT NULL,
    effective_to         DATE,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by           UUID,
    updated_by           UUID,
    deleted_at           TIMESTAMPTZ,
    deleted_by           UUID,
    CONSTRAINT ck_assign_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

-- one current primary company per employee
CREATE UNIQUE INDEX uq_assign_primary_company
    ON employee.employee_assignments (employee_id)
    WHERE is_primary_company AND effective_to IS NULL AND deleted_at IS NULL;

-- one current primary team per employee per company
CREATE UNIQUE INDEX uq_assign_primary_team
    ON employee.employee_assignments (employee_id, company_id)
    WHERE is_primary_team AND effective_to IS NULL AND deleted_at IS NULL;

CREATE INDEX ix_assign_employee ON employee.employee_assignments (employee_id);

CREATE INDEX ix_assign_company  ON employee.employee_assignments (company_id);

CREATE INDEX ix_assign_team     ON employee.employee_assignments (team_id);

CREATE INDEX ix_assign_eff_to   ON employee.employee_assignments (effective_to);

CREATE TABLE employee.employee_documents (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID        NOT NULL REFERENCES employee.employees(id),
    doc_type      employee.document_type NOT NULL,
    file_key      VARCHAR(512) NOT NULL,
    file_name     VARCHAR(255) NOT NULL,
    mime_type     VARCHAR(120),
    uploaded_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_emp_docs_employee ON employee.employee_documents (employee_id);

CREATE TABLE employee.employee_bank_accounts (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID        NOT NULL REFERENCES employee.employees(id),
    bank_code     VARCHAR(20) NOT NULL,
    account_no    VARCHAR(128) NOT NULL,  -- encrypted at app layer
    account_name  VARCHAR(160) NOT NULL,
    is_primary    BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_emp_bank_employee ON employee.employee_bank_accounts (employee_id);

-- ============================================================================
-- DOMAIN 3: PERMISSION
-- ============================================================================

CREATE TABLE permission.users (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID        REFERENCES employee.employees(id),  -- null for system/ai
    username      VARCHAR(120) NOT NULL,
    password_hash VARCHAR(255),
    user_type     permission.user_type NOT NULL DEFAULT 'human',
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    last_login_at TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_users_employee ON permission.users (employee_id);

CREATE TABLE permission.roles (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(40) NOT NULL,
    name          VARCHAR(120) NOT NULL,
    is_system     BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE TABLE permission.permissions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key           VARCHAR(80) NOT NULL UNIQUE,
    description   VARCHAR(255),
    category      VARCHAR(60),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID
);

CREATE TABLE permission.role_permissions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id       UUID        NOT NULL REFERENCES permission.roles(id),
    permission_id UUID        NOT NULL REFERENCES permission.permissions(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

CREATE TABLE permission.user_roles (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES permission.users(id),
    role_id       UUID        NOT NULL REFERENCES permission.roles(id),
    granted_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    granted_by    UUID,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE TABLE permission.scope_grants (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES permission.users(id),
    scope_type    permission.scope_type NOT NULL,
    company_id    UUID        REFERENCES organization.companies(id),
    team_id       UUID        REFERENCES organization.teams(id),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    CONSTRAINT ck_scope_shape CHECK (
        (scope_type = 'all'     AND company_id IS NULL AND team_id IS NULL) OR
        (scope_type = 'company' AND company_id IS NOT NULL AND team_id IS NULL) OR
        (scope_type = 'team'    AND team_id IS NOT NULL) OR
        (scope_type = 'self')
    )
);

CREATE INDEX ix_scope_user ON permission.scope_grants (user_id);

CREATE INDEX ix_scope_lookup ON permission.scope_grants (scope_type, company_id, team_id);

CREATE TABLE permission.menu_permissions (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    menu_key                VARCHAR(80) NOT NULL,
    surface                 permission.surface NOT NULL,
    required_permission_id  UUID        REFERENCES permission.permissions(id),
    feature_flag_key        VARCHAR(80),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID,
    updated_by              UUID,
    CONSTRAINT uq_menu_surface UNIQUE (menu_key, surface)
);

CREATE TABLE permission.impersonation_log (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id  UUID        NOT NULL REFERENCES permission.users(id),
    target_user_id UUID        NOT NULL REFERENCES permission.users(id),
    started_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    ended_at       TIMESTAMPTZ,
    reason         TEXT,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID
);

CREATE INDEX ix_imp_actor  ON permission.impersonation_log (actor_user_id);

CREATE INDEX ix_imp_target ON permission.impersonation_log (target_user_id);

CREATE TABLE permission.feature_flags (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key           VARCHAR(80) NOT NULL,
    company_id    UUID        REFERENCES organization.companies(id),  -- null = global
    enabled       BOOLEAN     NOT NULL DEFAULT FALSE,
    payload       JSONB,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID
);

-- treat NULL company as global; unique per (key, company)
CREATE UNIQUE INDEX uq_flag_key_company
    ON permission.feature_flags (key, COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid));

-- ============================================================================
-- DOMAIN 6: WORKFLOW  (defined before Attendance/Leave so they can FK to it)
-- ============================================================================

CREATE TABLE workflow.workflow_definitions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(60) NOT NULL,
    name          VARCHAR(120) NOT NULL,
    entity_type   workflow.entity_type NOT NULL,
    version       INT         NOT NULL DEFAULT 1,
    is_active     BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_wf_def_entity ON workflow.workflow_definitions (entity_type);

CREATE TABLE workflow.workflow_steps (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_definition_id  UUID        NOT NULL REFERENCES workflow.workflow_definitions(id),
    step_order              INT         NOT NULL,
    name                    VARCHAR(120) NOT NULL,
    approver_rule           workflow.approver_rule NOT NULL,
    approver_role_id        UUID        REFERENCES permission.roles(id),
    allow_escalate          BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID,
    updated_by              UUID,
    CONSTRAINT uq_wf_step_order UNIQUE (workflow_definition_id, step_order),
    CONSTRAINT ck_wf_step_role CHECK (
        approver_rule <> 'role' OR approver_role_id IS NOT NULL)
);

CREATE INDEX ix_wf_step_def ON workflow.workflow_steps (workflow_definition_id);

CREATE TABLE workflow.workflow_instances (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_definition_id  UUID        NOT NULL REFERENCES workflow.workflow_definitions(id),
    entity_type             workflow.entity_type NOT NULL,
    entity_id               UUID        NOT NULL,  -- polymorphic ref
    company_id              UUID        REFERENCES organization.companies(id),
    current_step_order      INT         NOT NULL DEFAULT 1,
    status                  workflow.instance_status NOT NULL DEFAULT 'pending',
    initiated_by            UUID        REFERENCES permission.users(id),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by              UUID,
    updated_by              UUID,
    deleted_at              TIMESTAMPTZ,
    deleted_by              UUID
);

CREATE INDEX ix_wf_inst_entity  ON workflow.workflow_instances (entity_type, entity_id);

CREATE INDEX ix_wf_inst_status  ON workflow.workflow_instances (status);

CREATE INDEX ix_wf_inst_company ON workflow.workflow_instances (company_id);

-- Append-only action log
CREATE TABLE workflow.workflow_actions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    workflow_instance_id  UUID        NOT NULL REFERENCES workflow.workflow_instances(id),
    step_order            INT         NOT NULL,
    action                workflow.action_type NOT NULL,
    actor_user_id         UUID        NOT NULL REFERENCES permission.users(id),
    is_owner_override     BOOLEAN     NOT NULL DEFAULT FALSE,
    comment               TEXT,
    acted_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_wf_action_inst ON workflow.workflow_actions (workflow_instance_id);

-- ============================================================================
-- DOMAIN 4: ATTENDANCE
-- ============================================================================

CREATE TABLE attendance.attendance_records (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID        NOT NULL REFERENCES employee.employees(id),
    company_id      UUID        NOT NULL REFERENCES organization.companies(id),
    work_date       DATE        NOT NULL,
    check_in_at     TIMESTAMPTZ,
    check_out_at    TIMESTAMPTZ,
    late_minutes    INT         NOT NULL DEFAULT 0,
    late_deduction  NUMERIC(14,2) NOT NULL DEFAULT 0,
    worked_minutes  INT         NOT NULL DEFAULT 0,
    status          attendance.record_status NOT NULL DEFAULT 'incomplete',
    source          attendance.record_source NOT NULL DEFAULT 'telegram',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT ck_att_late_minutes CHECK (late_minutes >= 0),
    CONSTRAINT ck_att_checkout CHECK (check_out_at IS NULL OR check_in_at IS NULL OR check_out_at >= check_in_at)
);

CREATE INDEX ix_att_company_date ON attendance.attendance_records (company_id, work_date);

CREATE INDEX ix_att_employee     ON attendance.attendance_records (employee_id);

CREATE INDEX ix_att_status       ON attendance.attendance_records (status);

CREATE TABLE attendance.break_records (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_record_id  UUID        NOT NULL REFERENCES attendance.attendance_records(id),
    break_start_at        TIMESTAMPTZ,
    break_end_at          TIMESTAMPTZ,
    duration_minutes      INT,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    CONSTRAINT ck_break_order CHECK (break_end_at IS NULL OR break_start_at IS NULL OR break_end_at >= break_start_at)
);

CREATE INDEX ix_break_att ON attendance.break_records (attendance_record_id);

CREATE TABLE attendance.overtime_records (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id           UUID        NOT NULL REFERENCES employee.employees(id),
    company_id            UUID        NOT NULL REFERENCES organization.companies(id),
    work_date             DATE        NOT NULL,
    ot_hours              NUMERIC(5,2) NOT NULL,
    rate_applied          NUMERIC(10,2) NOT NULL,
    amount                NUMERIC(14,2) NOT NULL,
    workflow_instance_id  UUID        REFERENCES workflow.workflow_instances(id),
    status                attendance.approval_status NOT NULL DEFAULT 'pending',
    payroll_item_id       UUID,  -- FK added after payroll.payroll_items
    formula_version_id    UUID,  -- FK added after system.formula_versions
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID,
    CONSTRAINT ck_ot_hours_full CHECK (ot_hours >= 1 AND ot_hours = trunc(ot_hours))
);

CREATE INDEX ix_ot_emp_date ON attendance.overtime_records (employee_id, work_date);

CREATE INDEX ix_ot_status   ON attendance.overtime_records (status);

CREATE TABLE attendance.attendance_corrections (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    attendance_record_id  UUID        NOT NULL REFERENCES attendance.attendance_records(id),
    requested_by          UUID        NOT NULL REFERENCES permission.users(id),
    field                 VARCHAR(60) NOT NULL,
    old_value             JSONB,
    new_value             JSONB,
    reason                TEXT,
    workflow_instance_id  UUID        REFERENCES workflow.workflow_instances(id),
    status                attendance.approval_status NOT NULL DEFAULT 'pending',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID
);

CREATE INDEX ix_att_corr_record ON attendance.attendance_corrections (attendance_record_id);

CREATE TABLE attendance.attendance_reminders (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID        NOT NULL REFERENCES employee.employees(id),
    work_date     DATE        NOT NULL,
    reminder_type attendance.reminder_type NOT NULL,
    sent_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX uq_att_reminder
    ON attendance.attendance_reminders (employee_id, work_date, reminder_type);

-- ============================================================================
-- DOMAIN 5: LEAVE
-- ============================================================================

CREATE TABLE leave.leave_types (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code                  VARCHAR(40) NOT NULL,
    name                  VARCHAR(120) NOT NULL,
    accrual_period        leave.accrual_period NOT NULL,
    default_quota         NUMERIC(6,2) NOT NULL,
    convertible_to_bonus  BOOLEAN     NOT NULL DEFAULT FALSE,
    allow_borrow_future   BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID
);

CREATE TABLE leave.leave_balances (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id   UUID        NOT NULL REFERENCES employee.employees(id),
    leave_type_id UUID        NOT NULL REFERENCES leave.leave_types(id),
    period_start  DATE        NOT NULL,
    period_end    DATE        NOT NULL,
    entitled      NUMERIC(6,2) NOT NULL DEFAULT 0,
    used          NUMERIC(6,2) NOT NULL DEFAULT 0,
    borrowed      NUMERIC(6,2) NOT NULL DEFAULT 0,
    remaining     NUMERIC(6,2) NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    CONSTRAINT ck_leave_period CHECK (period_end >= period_start)
);

CREATE INDEX ix_leave_balance_emp ON leave.leave_balances (employee_id);

CREATE TABLE leave.leave_requests (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id           UUID        NOT NULL REFERENCES employee.employees(id),
    company_id            UUID        NOT NULL REFERENCES organization.companies(id),
    leave_type_id         UUID        NOT NULL REFERENCES leave.leave_types(id),
    start_date            DATE        NOT NULL,
    end_date              DATE        NOT NULL,
    days                  NUMERIC(5,2) NOT NULL,
    is_borrowed           BOOLEAN     NOT NULL DEFAULT FALSE,
    reason                TEXT,
    workflow_instance_id  UUID        REFERENCES workflow.workflow_instances(id),
    status                leave.request_status NOT NULL DEFAULT 'pending',
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID,
    CONSTRAINT ck_leave_req_dates CHECK (end_date >= start_date),
    CONSTRAINT ck_leave_req_days  CHECK (days > 0)
);

CREATE INDEX ix_leave_req_emp_date ON leave.leave_requests (employee_id, start_date);

CREATE INDEX ix_leave_req_status   ON leave.leave_requests (status);

CREATE INDEX ix_leave_req_company  ON leave.leave_requests (company_id);

CREATE TABLE leave.holiday_conversions (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id       UUID        NOT NULL REFERENCES employee.employees(id),
    company_id        UUID        NOT NULL REFERENCES organization.companies(id),
    payroll_cycle_id  UUID        NOT NULL,  -- FK added after payroll.payroll_cycles
    unused_days       NUMERIC(6,2) NOT NULL DEFAULT 0,
    rate_per_day      NUMERIC(14,2) NOT NULL DEFAULT 600,
    cap_amount        NUMERIC(14,2) NOT NULL DEFAULT 1200,
    override_cap      BOOLEAN     NOT NULL DEFAULT FALSE,
    bonus_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
    payroll_item_id   UUID,  -- FK added after payroll.payroll_items
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_by        UUID,
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID,
    CONSTRAINT ck_holiday_cap CHECK (override_cap OR bonus_amount <= cap_amount)
);

-- ============================================================================
-- DOMAIN 16/19 dependency: system.formula_versions referenced by payroll etc.
-- Formula tables are fully defined in the SYSTEM domain file, but we need
-- formula_definitions + formula_versions to exist before payroll FKs.
-- They are created here-first to satisfy ordering, then the SYSTEM file
-- assumes their existence. (Single concatenated run resolves order.)
-- ============================================================================

CREATE TABLE system.formula_definitions (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    key           VARCHAR(80) NOT NULL,
    name          VARCHAR(160) NOT NULL,
    return_type   system.formula_return_type NOT NULL DEFAULT 'number',
    category      VARCHAR(60),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE TABLE system.formula_versions (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    formula_definition_id  UUID        NOT NULL REFERENCES system.formula_definitions(id),
    version                INT         NOT NULL,
    expression             TEXT        NOT NULL,
    parameters             JSONB,
    effective_from         DATE        NOT NULL,
    effective_to           DATE,
    is_active              BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by             UUID,
    updated_by             UUID,
    deleted_at             TIMESTAMPTZ,
    deleted_by             UUID,
    CONSTRAINT uq_formula_ver UNIQUE (formula_definition_id, version),
    CONSTRAINT ck_formula_period CHECK (effective_to IS NULL OR effective_to >= effective_from),
    -- no overlapping effective windows per definition (live rows)
    CONSTRAINT ex_formula_no_overlap EXCLUDE USING gist (
        formula_definition_id WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (deleted_at IS NULL)
);

CREATE INDEX ix_formula_ver_def ON system.formula_versions (formula_definition_id);

-- ============================================================================
-- DOMAIN 7: PAYROLL
-- ============================================================================

CREATE TABLE payroll.payroll_cycles (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        NOT NULL REFERENCES organization.companies(id),
    period_start  DATE        NOT NULL,   -- 25th prev month
    period_end    DATE        NOT NULL,   -- 23rd
    pay_date      DATE        NOT NULL,   -- 25th
    status        payroll.cycle_status NOT NULL DEFAULT 'open',
    locked_at     TIMESTAMPTZ,
    paid_at       TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    CONSTRAINT ck_payroll_period CHECK (period_end >= period_start)
);

CREATE INDEX ix_payroll_cycle_company_status ON payroll.payroll_cycles (company_id, status);

CREATE TABLE payroll.payroll_items (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_cycle_id   UUID        NOT NULL REFERENCES payroll.payroll_cycles(id),
    employee_id        UUID        NOT NULL REFERENCES employee.employees(id),
    company_id         UUID        NOT NULL REFERENCES organization.companies(id),
    item_type          payroll.item_type NOT NULL,
    amount             NUMERIC(14,2) NOT NULL,
    quantity           NUMERIC(8,2),
    formula_version_id UUID        REFERENCES system.formula_versions(id),
    source_ref_type    payroll.source_ref_type,
    source_ref_id      UUID,
    note               TEXT,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         UUID,
    updated_by         UUID,
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID
);

CREATE INDEX ix_payroll_item_cycle_emp ON payroll.payroll_items (payroll_cycle_id, employee_id);

CREATE INDEX ix_payroll_item_type      ON payroll.payroll_items (item_type);

CREATE INDEX ix_payroll_item_source    ON payroll.payroll_items (source_ref_type, source_ref_id);

CREATE TABLE payroll.payslips (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    payroll_cycle_id  UUID        NOT NULL REFERENCES payroll.payroll_cycles(id),
    employee_id       UUID        NOT NULL REFERENCES employee.employees(id),
    gross             NUMERIC(14,2) NOT NULL DEFAULT 0,
    deductions        NUMERIC(14,2) NOT NULL DEFAULT 0,
    net               NUMERIC(14,2) NOT NULL DEFAULT 0,
    breakdown         JSONB,
    generated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    file_key          VARCHAR(512),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_by        UUID,
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);

CREATE TABLE payroll.salary_history (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id     UUID        NOT NULL REFERENCES employee.employees(id),
    company_id      UUID        NOT NULL REFERENCES organization.companies(id),
    monthly_salary  NUMERIC(14,2) NOT NULL,
    effective_from  DATE        NOT NULL,
    effective_to    DATE,
    reason          VARCHAR(255),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    deleted_at      TIMESTAMPTZ,
    deleted_by      UUID,
    CONSTRAINT ck_salary_period CHECK (effective_to IS NULL OR effective_to >= effective_from),
    CONSTRAINT ex_salary_no_overlap EXCLUDE USING gist (
        employee_id WITH =,
        company_id  WITH =,
        daterange(effective_from, COALESCE(effective_to, 'infinity'::date), '[]') WITH &&
    ) WHERE (deleted_at IS NULL)
);

CREATE INDEX ix_salary_emp ON payroll.salary_history (employee_id);

CREATE TABLE payroll.deposits (
    id                 UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id        UUID        NOT NULL REFERENCES employee.employees(id),
    owning_company_id  UUID        NOT NULL REFERENCES organization.companies(id),
    payroll_cycle_id   UUID        REFERENCES payroll.payroll_cycles(id),
    amount             NUMERIC(14,2) NOT NULL DEFAULT 500,
    running_total      NUMERIC(14,2) NOT NULL DEFAULT 0,
    refunded_at        TIMESTAMPTZ,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by         UUID,
    updated_by         UUID,
    deleted_at         TIMESTAMPTZ,
    deleted_by         UUID,
    CONSTRAINT ck_deposit_cap CHECK (running_total <= 3000),
    CONSTRAINT ck_deposit_amount CHECK (amount >= 0)
);

CREATE INDEX ix_deposit_emp_company ON payroll.deposits (employee_id, owning_company_id);

-- Deferred FKs now that payroll tables exist
ALTER TABLE attendance.overtime_records
    ADD CONSTRAINT fk_ot_payroll_item FOREIGN KEY (payroll_item_id) REFERENCES payroll.payroll_items(id);

ALTER TABLE attendance.overtime_records
    ADD CONSTRAINT fk_ot_formula_ver FOREIGN KEY (formula_version_id) REFERENCES system.formula_versions(id);

ALTER TABLE leave.holiday_conversions
    ADD CONSTRAINT fk_holiday_cycle FOREIGN KEY (payroll_cycle_id) REFERENCES payroll.payroll_cycles(id);

ALTER TABLE leave.holiday_conversions
    ADD CONSTRAINT fk_holiday_payroll_item FOREIGN KEY (payroll_item_id) REFERENCES payroll.payroll_items(id);

-- ============================================================================
-- DOMAIN 8: COMMISSION
-- ============================================================================

CREATE TABLE commission.commission_targets (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    function_id    UUID        REFERENCES organization.functions(id),
    role_level     organization.role_level NOT NULL DEFAULT 'employee',
    metric         commission.metric NOT NULL DEFAULT 'unique_candidates',
    target_value   NUMERIC(10,2) NOT NULL DEFAULT 24,
    effective_from DATE        NOT NULL,
    effective_to   DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID,
    CONSTRAINT ck_comm_target_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX ix_comm_target_fn ON commission.commission_targets (function_id, role_level);

CREATE TABLE commission.commission_records (
    id                  UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id         UUID        NOT NULL REFERENCES employee.employees(id),
    company_id          UUID        NOT NULL REFERENCES organization.companies(id),
    earn_cycle_id       UUID        NOT NULL REFERENCES payroll.payroll_cycles(id),
    pay_cycle_id        UUID        REFERENCES payroll.payroll_cycles(id),  -- one month behind
    achieved_value      NUMERIC(10,2) NOT NULL DEFAULT 0,
    target_value        NUMERIC(10,2) NOT NULL DEFAULT 0,
    qualified           BOOLEAN     NOT NULL DEFAULT FALSE,
    gross_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
    formula_version_id  UUID        REFERENCES system.formula_versions(id),
    status              commission.record_status NOT NULL DEFAULT 'accrued',
    payroll_item_id     UUID        REFERENCES payroll.payroll_items(id),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by          UUID,
    updated_by          UUID,
    deleted_at          TIMESTAMPTZ,
    deleted_by          UUID
);

CREATE INDEX ix_comm_rec_emp_earn ON commission.commission_records (employee_id, earn_cycle_id);

CREATE INDEX ix_comm_rec_status   ON commission.commission_records (status);

CREATE TABLE commission.commission_holds (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_record_id  UUID        NOT NULL REFERENCES commission.commission_records(id),
    hold_cycle_id         UUID        NOT NULL REFERENCES payroll.payroll_cycles(id),
    resolution            commission.hold_resolution NOT NULL DEFAULT 'pending',
    resolved_cycle_id     UUID        REFERENCES payroll.payroll_cycles(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID
);

CREATE INDEX ix_comm_hold_rec ON commission.commission_holds (commission_record_id);

CREATE TABLE commission.commission_redistributions (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_commission_record_id UUID        NOT NULL REFERENCES commission.commission_records(id),
    source_hold_id              UUID        REFERENCES commission.commission_holds(id),  -- lineage (optional)
    to_team_id                  UUID        NOT NULL REFERENCES organization.teams(id),
    to_employee_id              UUID        REFERENCES employee.employees(id),
    amount                      NUMERIC(14,2) NOT NULL,
    redistributed_cycle_id      UUID        NOT NULL REFERENCES payroll.payroll_cycles(id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  UUID,
    updated_by                  UUID,
    deleted_at                  TIMESTAMPTZ,
    deleted_by                  UUID,
    CONSTRAINT ck_redis_amount CHECK (amount >= 0)
);

CREATE INDEX ix_comm_redis_source ON commission.commission_redistributions (source_commission_record_id);

CREATE INDEX ix_comm_redis_team   ON commission.commission_redistributions (to_team_id);

CREATE TABLE commission.commission_splits (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    commission_record_id  UUID        NOT NULL REFERENCES commission.commission_records(id),
    employee_id           UUID        NOT NULL REFERENCES employee.employees(id),
    share_ratio           NUMERIC(10,4) NOT NULL,
    amount                NUMERIC(14,2) NOT NULL,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    CONSTRAINT ck_split_ratio CHECK (share_ratio > 0 AND share_ratio <= 1),
    CONSTRAINT uq_split_rec_emp UNIQUE (commission_record_id, employee_id)
);

CREATE INDEX ix_comm_split_rec ON commission.commission_splits (commission_record_id);

CREATE TABLE commission.big_leader_ledger (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id      UUID        NOT NULL REFERENCES employee.employees(id),
    company_id       UUID        NOT NULL REFERENCES organization.companies(id),
    cycle_id         UUID        NOT NULL REFERENCES payroll.payroll_cycles(id),
    opening_carry    NUMERIC(14,2) NOT NULL DEFAULT 0,   -- may be negative
    earned           NUMERIC(14,2) NOT NULL DEFAULT 0,
    closing_carry    NUMERIC(14,2) NOT NULL DEFAULT 0,   -- may be negative
    payroll_item_id  UUID        REFERENCES payroll.payroll_items(id),
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by       UUID,
    updated_by       UUID,
    deleted_at       TIMESTAMPTZ,
    deleted_by       UUID,
    CONSTRAINT uq_big_leader_ledger UNIQUE (employee_id, company_id, cycle_id)
);

CREATE INDEX ix_big_leader_emp ON commission.big_leader_ledger (employee_id);

-- ============================================================================
-- DOMAIN 9: FINANCE
-- ============================================================================

CREATE TABLE finance.advance_requests (
    id                          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id                 UUID        NOT NULL REFERENCES employee.employees(id),
    company_id                  UUID        NOT NULL REFERENCES organization.companies(id),
    amount                      NUMERIC(14,2) NOT NULL,
    reason                      TEXT,
    workflow_instance_id        UUID        REFERENCES workflow.workflow_instances(id),
    status                      finance.request_status NOT NULL DEFAULT 'pending',
    recovered_payroll_item_id   UUID        REFERENCES payroll.payroll_items(id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                  UUID,
    updated_by                  UUID,
    deleted_at                  TIMESTAMPTZ,
    deleted_by                  UUID,
    CONSTRAINT ck_advance_amount CHECK (amount > 0)
);

CREATE INDEX ix_advance_emp_status ON finance.advance_requests (employee_id, status);

CREATE TABLE finance.deposit_refunds (
    id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id               UUID        NOT NULL REFERENCES employee.employees(id),
    owning_company_id         UUID        NOT NULL REFERENCES organization.companies(id),
    amount                    NUMERIC(14,2) NOT NULL,
    workflow_instance_id      UUID        REFERENCES workflow.workflow_instances(id),
    status                    finance.request_status NOT NULL DEFAULT 'pending',
    refunded_payroll_item_id  UUID        REFERENCES payroll.payroll_items(id),
    created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by                UUID,
    updated_by                UUID,
    deleted_at                TIMESTAMPTZ,
    deleted_by                UUID,
    CONSTRAINT ck_refund_amount CHECK (amount > 0)
);

CREATE INDEX ix_refund_emp ON finance.deposit_refunds (employee_id);

CREATE TABLE finance.ledger_entries (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID        NOT NULL REFERENCES organization.companies(id),
    entry_date   DATE        NOT NULL,
    account      VARCHAR(60) NOT NULL,
    direction    finance.ledger_direction NOT NULL,
    amount       NUMERIC(14,2) NOT NULL,
    ref_type     VARCHAR(60),
    ref_id       UUID,
    description  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID,
    CONSTRAINT ck_ledger_amount CHECK (amount >= 0)
);

CREATE INDEX ix_ledger_company_date ON finance.ledger_entries (company_id, entry_date);

CREATE INDEX ix_ledger_ref          ON finance.ledger_entries (ref_type, ref_id);

-- ============================================================================
-- DOMAIN 16 (AI) partial: ai.ai_recommendations needed by performance FK.
-- Created in AI file; performance references it via deferred FK below.
-- ============================================================================

-- ============================================================================
-- DOMAIN 10: PERFORMANCE
-- ============================================================================

CREATE TABLE performance.performance_cycles (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        REFERENCES organization.companies(id),  -- null = all
    period_start  DATE        NOT NULL,
    period_end    DATE        NOT NULL,
    status        performance.cycle_status NOT NULL DEFAULT 'open',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID,
    CONSTRAINT ck_perf_cycle_period CHECK (period_end >= period_start)
);

CREATE INDEX ix_perf_cycle_company ON performance.performance_cycles (company_id);

CREATE TABLE performance.evaluation_weights (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    dimension      performance.dimension NOT NULL,
    weight         NUMERIC(10,4) NOT NULL,
    effective_from DATE        NOT NULL,
    effective_to   DATE,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID,
    CONSTRAINT ck_weight_range CHECK (weight >= 0 AND weight <= 1),
    CONSTRAINT ck_weight_period CHECK (effective_to IS NULL OR effective_to >= effective_from)
);

CREATE INDEX ix_eval_weight_dim ON performance.evaluation_weights (dimension);

CREATE TABLE performance.evaluations (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    performance_cycle_id  UUID        NOT NULL REFERENCES performance.performance_cycles(id),
    employee_id           UUID        NOT NULL REFERENCES employee.employees(id),
    company_id            UUID        NOT NULL REFERENCES organization.companies(id),
    total_score           NUMERIC(6,2) NOT NULL DEFAULT 0,
    status                performance.eval_status NOT NULL DEFAULT 'draft',
    ai_recommendation_id  UUID,  -- FK added after ai.ai_recommendations
    finalized_by          UUID        REFERENCES permission.users(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID,
    CONSTRAINT uq_eval_cycle_emp UNIQUE (performance_cycle_id, employee_id)
);

CREATE INDEX ix_eval_emp ON performance.evaluations (employee_id);

CREATE TABLE performance.evaluation_scores (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_id   UUID        NOT NULL REFERENCES performance.evaluations(id),
    dimension       performance.dimension NOT NULL,
    raw_score       NUMERIC(6,2) NOT NULL DEFAULT 0,
    weight_applied  NUMERIC(10,4) NOT NULL DEFAULT 0,
    weighted_score  NUMERIC(8,4) NOT NULL DEFAULT 0,
    scored_by       performance.scorer NOT NULL DEFAULT 'system',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    CONSTRAINT uq_eval_score_dim UNIQUE (evaluation_id, dimension, scored_by)
);

CREATE INDEX ix_eval_score_eval ON performance.evaluation_scores (evaluation_id);

-- ============================================================================
-- DOMAIN 11: RECRUITMENT
-- ============================================================================

CREATE TABLE recruitment.candidates (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id            UUID        NOT NULL REFERENCES organization.companies(id),
    recruiter_employee_id UUID        NOT NULL REFERENCES employee.employees(id),
    full_name             VARCHAR(160) NOT NULL,
    phone                 VARCHAR(32),
    source                VARCHAR(80),
    stage                 recruitment.candidate_stage NOT NULL DEFAULT 'new',
    is_unique_counted     BOOLEAN     NOT NULL DEFAULT FALSE,
    counted_cycle_id      UUID        REFERENCES payroll.payroll_cycles(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID
);

-- dedup unique candidate by phone within a company (live rows)
CREATE UNIQUE INDEX uq_candidate_company_phone_live
    ON recruitment.candidates (company_id, phone)
    WHERE phone IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX ix_candidate_recruiter ON recruitment.candidates (recruiter_employee_id, counted_cycle_id);

CREATE TABLE recruitment.recruitment_pipeline_events (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    candidate_id  UUID        NOT NULL REFERENCES recruitment.candidates(id),
    from_stage    recruitment.candidate_stage,
    to_stage      recruitment.candidate_stage NOT NULL,
    changed_by    UUID        REFERENCES permission.users(id),
    changed_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_pipeline_candidate ON recruitment.recruitment_pipeline_events (candidate_id);

-- ============================================================================
-- DOMAIN 12: REFERRAL
-- ============================================================================

CREATE TABLE referral.referrals (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    referrer_employee_id  UUID        NOT NULL REFERENCES employee.employees(id),
    referred_employee_id  UUID        NOT NULL REFERENCES employee.employees(id),
    company_id            UUID        NOT NULL REFERENCES organization.companies(id),
    reward_amount         NUMERIC(14,2) NOT NULL DEFAULT 2000,
    qualifying_condition  referral.qualifying_condition,
    qualified_at          TIMESTAMPTZ,
    status                referral.referral_status NOT NULL DEFAULT 'pending',
    payroll_item_id       UUID        REFERENCES payroll.payroll_items(id),
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID,
    deleted_at            TIMESTAMPTZ,
    deleted_by            UUID,
    CONSTRAINT ck_referral_not_self CHECK (referrer_employee_id <> referred_employee_id)
);

-- prevent duplicate reward per referred person (live rows)
CREATE UNIQUE INDEX uq_referral_referred_live
    ON referral.referrals (referred_employee_id) WHERE deleted_at IS NULL;

CREATE INDEX ix_referral_referrer ON referral.referrals (referrer_employee_id);

-- ============================================================================
-- DOMAIN 13: TRAINING
-- ============================================================================

CREATE TABLE training.training_courses (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    code          VARCHAR(40) NOT NULL,
    title         VARCHAR(200) NOT NULL,
    description   TEXT,
    is_mandatory  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE TABLE training.training_assignments (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    course_id     UUID        NOT NULL REFERENCES training.training_courses(id),
    employee_id   UUID        NOT NULL REFERENCES employee.employees(id),
    assigned_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    due_date      DATE,
    status        training.assignment_status NOT NULL DEFAULT 'assigned',
    completed_at  TIMESTAMPTZ,
    score         NUMERIC(6,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_training_emp ON training.training_assignments (employee_id);

-- ============================================================================
-- DOMAIN 14: ASSETS
-- ============================================================================

CREATE TABLE assets.assets (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        NOT NULL REFERENCES organization.companies(id),
    asset_tag     VARCHAR(60) NOT NULL,
    name          VARCHAR(160) NOT NULL,
    category      VARCHAR(80),
    status        assets.asset_status NOT NULL DEFAULT 'available',
    purchase_date DATE,
    value         NUMERIC(14,2),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_asset_company ON assets.assets (company_id);

CREATE TABLE assets.asset_assignments (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id       UUID        NOT NULL REFERENCES assets.assets(id),
    employee_id    UUID        NOT NULL REFERENCES employee.employees(id),
    assigned_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    returned_at    TIMESTAMPTZ,
    condition_out  VARCHAR(120),
    condition_in   VARCHAR(120),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by     UUID,
    updated_by     UUID,
    deleted_at     TIMESTAMPTZ,
    deleted_by     UUID
);

-- an asset can be in only one active (un-returned) assignment
CREATE UNIQUE INDEX uq_asset_active_assignment
    ON assets.asset_assignments (asset_id)
    WHERE returned_at IS NULL AND deleted_at IS NULL;

CREATE INDEX ix_asset_assign_asset ON assets.asset_assignments (asset_id);

CREATE INDEX ix_asset_assign_emp   ON assets.asset_assignments (employee_id);

-- ============================================================================
-- DOMAIN 15: KNOWLEDGE BASE
-- ============================================================================

CREATE TABLE knowledge.kb_articles (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        REFERENCES organization.companies(id),  -- null = global
    title         VARCHAR(200) NOT NULL,
    slug          VARCHAR(200) NOT NULL,
    body          TEXT,
    category      VARCHAR(80),
    is_published  BOOLEAN     NOT NULL DEFAULT FALSE,
    version       INT         NOT NULL DEFAULT 1,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_kb_company_pub ON knowledge.kb_articles (company_id, is_published);

CREATE TABLE knowledge.kb_article_versions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id  UUID        NOT NULL REFERENCES knowledge.kb_articles(id),
    version     INT         NOT NULL,
    body        TEXT,
    edited_by   UUID        REFERENCES permission.users(id),
    edited_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_kb_article_version UNIQUE (article_id, version)
);

CREATE INDEX ix_kb_ver_article ON knowledge.kb_article_versions (article_id);

-- ============================================================================
-- DOMAIN 16: AI
-- ============================================================================

CREATE TABLE ai.ai_conversations (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES permission.users(id),
    channel     ai.channel  NOT NULL DEFAULT 'telegram',
    started_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    context     JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID,
    updated_by  UUID,
    deleted_at  TIMESTAMPTZ,
    deleted_by  UUID
);

CREATE INDEX ix_ai_conv_user ON ai.ai_conversations (user_id);

CREATE TABLE ai.ai_messages (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id UUID        NOT NULL REFERENCES ai.ai_conversations(id),
    role            ai.message_role NOT NULL,
    content         TEXT,
    tokens          INT,
    model           VARCHAR(80),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_ai_msg_conv ON ai.ai_messages (conversation_id);

CREATE TABLE ai.ai_recommendations (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_type  VARCHAR(60) NOT NULL,
    subject_id    UUID        NOT NULL,
    recommendation TEXT       NOT NULL,
    rationale     JSONB,
    confidence    NUMERIC(5,2),
    model         VARCHAR(80),
    accepted_by   UUID        REFERENCES permission.users(id),
    accepted_at   TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    CONSTRAINT ck_ai_confidence CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 100))
);

CREATE INDEX ix_ai_rec_subject ON ai.ai_recommendations (subject_type, subject_id);

-- Deferred FK: performance.evaluations.ai_recommendation_id
ALTER TABLE performance.evaluations
    ADD CONSTRAINT fk_eval_ai_rec
    FOREIGN KEY (ai_recommendation_id) REFERENCES ai.ai_recommendations(id);

CREATE TABLE ai.ai_embeddings (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    source_type  VARCHAR(60) NOT NULL,
    source_id    UUID        NOT NULL,
    chunk        TEXT        NOT NULL,
    embedding    VECTOR(1536),
    metadata     JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID
);

CREATE INDEX ix_ai_emb_source ON ai.ai_embeddings (source_type, source_id);

-- ============================================================================
-- DOMAIN 17: REPORTING
-- ============================================================================

CREATE TABLE reporting.report_snapshots (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        REFERENCES organization.companies(id),  -- null = all
    snapshot_type reporting.snapshot_type NOT NULL,
    snapshot_date DATE        NOT NULL,
    period_start  DATE,
    period_end    DATE,
    payload       JSONB       NOT NULL,
    generated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID
);

CREATE UNIQUE INDEX uq_snapshot
    ON reporting.report_snapshots (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), snapshot_type, snapshot_date);

CREATE INDEX ix_snapshot_type_date ON reporting.report_snapshots (snapshot_type, snapshot_date);

CREATE TABLE reporting.kpi_daily_facts (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id   UUID        NOT NULL REFERENCES organization.companies(id),
    fact_date    DATE        NOT NULL,
    metric_key   VARCHAR(80) NOT NULL,
    metric_value NUMERIC(18,4) NOT NULL DEFAULT 0,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by   UUID,
    updated_by   UUID,
    CONSTRAINT uq_kpi_fact UNIQUE (company_id, fact_date, metric_key)
);

CREATE INDEX ix_kpi_company_date ON reporting.kpi_daily_facts (company_id, fact_date);

-- ============================================================================
-- DOMAIN 18: TELEGRAM
-- ============================================================================

CREATE TABLE telegram.telegram_accounts (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES permission.users(id),
    telegram_user_id  BIGINT      NOT NULL,
    chat_id           BIGINT,
    username          VARCHAR(120),
    linked_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    is_active         BOOLEAN     NOT NULL DEFAULT TRUE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by        UUID,
    updated_by        UUID,
    deleted_at        TIMESTAMPTZ,
    deleted_by        UUID
);

CREATE INDEX ix_tg_account_user ON telegram.telegram_accounts (user_id);

CREATE TABLE telegram.telegram_sessions (
    id                    UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_account_id   UUID        NOT NULL REFERENCES telegram.telegram_accounts(id),
    state                 VARCHAR(80) NOT NULL DEFAULT 'idle',
    context               JSONB,
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by            UUID,
    updated_by            UUID
);

CREATE INDEX ix_tg_session_account ON telegram.telegram_sessions (telegram_account_id);

CREATE TABLE telegram.telegram_messages_log (
    id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_account_id  UUID        NOT NULL REFERENCES telegram.telegram_accounts(id),
    direction            telegram.direction NOT NULL,
    message_type         VARCHAR(60),
    payload              JSONB,
    telegram_message_id  BIGINT,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_tg_msg_account ON telegram.telegram_messages_log (telegram_account_id);

CREATE TABLE telegram.announcements (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id    UUID        REFERENCES organization.companies(id),
    team_id       UUID        REFERENCES organization.teams(id),
    title         VARCHAR(200) NOT NULL,
    body          TEXT,
    published_at  TIMESTAMPTZ,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by    UUID,
    updated_by    UUID,
    deleted_at    TIMESTAMPTZ,
    deleted_by    UUID
);

CREATE INDEX ix_announce_company ON telegram.announcements (company_id);

CREATE TABLE telegram.announcement_deliveries (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    announcement_id UUID        NOT NULL REFERENCES telegram.announcements(id),
    employee_id     UUID        NOT NULL REFERENCES employee.employees(id),
    delivered_at    TIMESTAMPTZ,
    read_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by      UUID,
    updated_by      UUID,
    CONSTRAINT uq_announce_delivery UNIQUE (announcement_id, employee_id)
);

CREATE INDEX ix_announce_del_emp ON telegram.announcement_deliveries (employee_id);

-- ============================================================================
-- DOMAIN 19: SYSTEM (remainder — formula tables already created in payroll file)
-- ============================================================================

-- Append-only audit log
CREATE TABLE system.audit_logs (
    id                    BIGSERIAL   PRIMARY KEY,
    actor_user_id         UUID,
    impersonator_user_id  UUID,
    company_id            UUID,
    entity_type           VARCHAR(80) NOT NULL,
    entity_id             UUID,
    action                VARCHAR(60) NOT NULL,
    before                JSONB,
    after                 JSONB,
    ip_address            INET,
    occurred_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_audit_entity   ON system.audit_logs (entity_type, entity_id);

CREATE INDEX ix_audit_actor    ON system.audit_logs (actor_user_id);

CREATE INDEX ix_audit_occurred ON system.audit_logs (occurred_at);

CREATE TABLE system.system_settings (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id  UUID        REFERENCES organization.companies(id),
    key         VARCHAR(80) NOT NULL,
    value       JSONB,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    created_by  UUID,
    updated_by  UUID
);

CREATE UNIQUE INDEX uq_setting_company_key
    ON system.system_settings (COALESCE(company_id, '00000000-0000-0000-0000-000000000000'::uuid), key);

CREATE TABLE system.job_runs (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    job_name     VARCHAR(120) NOT NULL,
    status       system.job_status NOT NULL DEFAULT 'running',
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ,
    error        TEXT,
    payload      JSONB,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_job_runs_name ON system.job_runs (job_name, started_at);

CREATE TABLE system.outbox_events (
    id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_type VARCHAR(80) NOT NULL,
    aggregate_id   UUID        NOT NULL,
    event_type     VARCHAR(100) NOT NULL,
    payload        JSONB       NOT NULL,
    occurred_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    processed_at   TIMESTAMPTZ,
    attempts       INT         NOT NULL DEFAULT 0
);

CREATE INDEX ix_outbox_aggregate   ON system.outbox_events (aggregate_type, aggregate_id);

CREATE TABLE system.backups_registry (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    backup_type  system.backup_type NOT NULL,
    location     VARCHAR(512) NOT NULL,
    size_bytes   BIGINT,
    started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status       system.job_status NOT NULL DEFAULT 'running',
    checksum     VARCHAR(128),
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX ix_backup_started ON system.backups_registry (started_at);
