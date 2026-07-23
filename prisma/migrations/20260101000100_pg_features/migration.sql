-- ============================================================================
-- WorkHQ - PostgreSQL-specific features (NOT representable in schema.prisma)
--
-- Contents (applied AFTER 20260101000000_init):
--   * Trigger functions: system.set_updated_at(), system.forbid_mutation()
--   * Triggers (70): updated_at maintenance on every business table; append-only
--     enforcement on audit_logs, workflow_actions, recruitment_pipeline_events
--   * Partial unique indexes (soft-delete-aware: WHERE deleted_at IS NULL, and
--     other conditional uniqueness e.g. one active primary assignment)
--   * pgvector HNSW index on ai.ai_embeddings.embedding (vector_cosine_ops)
--
-- These are isolated so `prisma migrate diff` never silently drops them and the
-- Prisma/raw-SQL boundary stays explicit and auditable.
-- ============================================================================

-- ---- Trigger functions -------------------------------------------------

CREATE OR REPLACE FUNCTION system.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION system.forbid_mutation()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Table %.% is append-only; % is not permitted',
        TG_TABLE_SCHEMA, TG_TABLE_NAME, TG_OP;
END;
$$ LANGUAGE plpgsql;

-- ---- Triggers, partial unique indexes, pgvector HNSW index -------------

CREATE UNIQUE INDEX uq_companies_code_live
    ON organization.companies (code) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_companies_updated
    BEFORE UPDATE ON organization.companies
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_functions_code_live
    ON organization.functions (code) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_functions_updated
    BEFORE UPDATE ON organization.functions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_teams_company_name_live
    ON organization.teams (company_id, name) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_teams_updated
    BEFORE UPDATE ON organization.teams
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_employees_global_id_live
    ON employee.employees (global_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_employees_updated
    BEFORE UPDATE ON employee.employees
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_assign_updated
    BEFORE UPDATE ON employee.employee_assignments
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_emp_docs_updated
    BEFORE UPDATE ON employee.employee_documents
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_emp_bank_primary
    ON employee.employee_bank_accounts (employee_id)
    WHERE is_primary AND deleted_at IS NULL;

CREATE TRIGGER trg_emp_bank_updated
    BEFORE UPDATE ON employee.employee_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_users_username_live
    ON permission.users (username) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_users_updated
    BEFORE UPDATE ON permission.users
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_roles_code_live
    ON permission.roles (code) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_roles_updated
    BEFORE UPDATE ON permission.roles
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_permissions_updated
    BEFORE UPDATE ON permission.permissions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_role_perm_updated
    BEFORE UPDATE ON permission.role_permissions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_user_role_live
    ON permission.user_roles (user_id, role_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_user_roles_updated
    BEFORE UPDATE ON permission.user_roles
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_scope_updated
    BEFORE UPDATE ON permission.scope_grants
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_menu_perm_updated
    BEFORE UPDATE ON permission.menu_permissions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_imp_updated
    BEFORE UPDATE ON permission.impersonation_log
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_flags_updated
    BEFORE UPDATE ON permission.feature_flags
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_wf_def_code_ver_live
    ON workflow.workflow_definitions (code, version) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_wf_def_updated
    BEFORE UPDATE ON workflow.workflow_definitions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_wf_step_updated
    BEFORE UPDATE ON workflow.workflow_steps
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_wf_inst_updated
    BEFORE UPDATE ON workflow.workflow_instances
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_wf_action_immutable
    BEFORE UPDATE OR DELETE ON workflow.workflow_actions
    FOR EACH ROW EXECUTE FUNCTION system.forbid_mutation();

CREATE UNIQUE INDEX uq_att_emp_date_live
    ON attendance.attendance_records (employee_id, work_date) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_att_updated
    BEFORE UPDATE ON attendance.attendance_records
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_break_updated
    BEFORE UPDATE ON attendance.break_records
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_ot_updated
    BEFORE UPDATE ON attendance.overtime_records
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_att_corr_updated
    BEFORE UPDATE ON attendance.attendance_corrections
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_att_rem_updated
    BEFORE UPDATE ON attendance.attendance_reminders
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_leave_type_code_live
    ON leave.leave_types (code) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_leave_type_updated
    BEFORE UPDATE ON leave.leave_types
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_leave_balance
    ON leave.leave_balances (employee_id, leave_type_id, period_start) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_leave_balance_updated
    BEFORE UPDATE ON leave.leave_balances
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_leave_req_updated
    BEFORE UPDATE ON leave.leave_requests
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_holiday_conv
    ON leave.holiday_conversions (employee_id, payroll_cycle_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_holiday_conv_updated
    BEFORE UPDATE ON leave.holiday_conversions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_formula_def_key_live
    ON system.formula_definitions (key) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_formula_def_updated
    BEFORE UPDATE ON system.formula_definitions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_formula_ver_updated
    BEFORE UPDATE ON system.formula_versions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_payroll_cycle_company_period_live
    ON payroll.payroll_cycles (company_id, period_start) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_payroll_cycle_updated
    BEFORE UPDATE ON payroll.payroll_cycles
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_payroll_item_updated
    BEFORE UPDATE ON payroll.payroll_items
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_payslip_cycle_emp_live
    ON payroll.payslips (payroll_cycle_id, employee_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_payslip_updated
    BEFORE UPDATE ON payroll.payslips
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_salary_updated
    BEFORE UPDATE ON payroll.salary_history
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_deposit_updated
    BEFORE UPDATE ON payroll.deposits
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_comm_target_updated
    BEFORE UPDATE ON commission.commission_targets
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_comm_rec_updated
    BEFORE UPDATE ON commission.commission_records
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_comm_hold_updated
    BEFORE UPDATE ON commission.commission_holds
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_comm_redis_updated
    BEFORE UPDATE ON commission.commission_redistributions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_comm_split_updated
    BEFORE UPDATE ON commission.commission_splits
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_big_leader_updated
    BEFORE UPDATE ON commission.big_leader_ledger
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_advance_updated
    BEFORE UPDATE ON finance.advance_requests
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_refund_updated
    BEFORE UPDATE ON finance.deposit_refunds
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_ledger_updated
    BEFORE UPDATE ON finance.ledger_entries
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_perf_cycle_updated
    BEFORE UPDATE ON performance.performance_cycles
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_eval_weight_updated
    BEFORE UPDATE ON performance.evaluation_weights
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_eval_updated
    BEFORE UPDATE ON performance.evaluations
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_eval_score_updated
    BEFORE UPDATE ON performance.evaluation_scores
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_candidate_updated
    BEFORE UPDATE ON recruitment.candidates
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_pipeline_immutable
    BEFORE UPDATE OR DELETE ON recruitment.recruitment_pipeline_events
    FOR EACH ROW EXECUTE FUNCTION system.forbid_mutation();

CREATE TRIGGER trg_referral_updated
    BEFORE UPDATE ON referral.referrals
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_course_code_live
    ON training.training_courses (code) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_course_updated
    BEFORE UPDATE ON training.training_courses
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_training_course_emp_live
    ON training.training_assignments (course_id, employee_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_training_updated
    BEFORE UPDATE ON training.training_assignments
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_asset_tag_live
    ON assets.assets (asset_tag) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_asset_updated
    BEFORE UPDATE ON assets.assets
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_asset_assign_updated
    BEFORE UPDATE ON assets.asset_assignments
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_kb_slug_live
    ON knowledge.kb_articles (slug) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_kb_updated
    BEFORE UPDATE ON knowledge.kb_articles
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_ai_conv_updated
    BEFORE UPDATE ON ai.ai_conversations
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_ai_rec_updated
    BEFORE UPDATE ON ai.ai_recommendations
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE INDEX ix_ai_emb_vector  ON ai.ai_embeddings
    USING hnsw (embedding vector_cosine_ops);

CREATE TRIGGER trg_ai_emb_updated
    BEFORE UPDATE ON ai.ai_embeddings
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_snapshot_updated
    BEFORE UPDATE ON reporting.report_snapshots
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_kpi_updated
    BEFORE UPDATE ON reporting.kpi_daily_facts
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_tg_user_id_live
    ON telegram.telegram_accounts (telegram_user_id) WHERE deleted_at IS NULL;

CREATE TRIGGER trg_tg_account_updated
    BEFORE UPDATE ON telegram.telegram_accounts
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_tg_session_updated
    BEFORE UPDATE ON telegram.telegram_sessions
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE UNIQUE INDEX uq_tg_msg
    ON telegram.telegram_messages_log (telegram_account_id, telegram_message_id, direction)
    WHERE telegram_message_id IS NOT NULL;

CREATE TRIGGER trg_announce_updated
    BEFORE UPDATE ON telegram.announcements
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_announce_del_updated
    BEFORE UPDATE ON telegram.announcement_deliveries
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_audit_immutable
    BEFORE UPDATE OR DELETE ON system.audit_logs
    FOR EACH ROW EXECUTE FUNCTION system.forbid_mutation();

CREATE TRIGGER trg_setting_updated
    BEFORE UPDATE ON system.system_settings
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE TRIGGER trg_job_runs_updated
    BEFORE UPDATE ON system.job_runs
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();

CREATE INDEX ix_outbox_unprocessed ON system.outbox_events (occurred_at) WHERE processed_at IS NULL;

CREATE TRIGGER trg_backup_updated
    BEFORE UPDATE ON system.backups_registry
    FOR EACH ROW EXECUTE FUNCTION system.set_updated_at();
