-- PAY-005 — Final payroll settlement engine

CREATE TYPE "employee"."final_settlement_status" AS ENUM (
  'draft', 'pending_review', 'approved', 'paid', 'cancelled'
);

CREATE TABLE "employee"."final_payroll_settlements" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "exit_case_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "payroll_cycle_id" UUID,
    "salary_prorate_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "unpaid_salary_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pending_ot_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pending_commission_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "pending_bonus_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "advance_deduction_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "equipment_deduction_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "penalty_deduction_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "deposit_return_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "other_adjustment_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "net_payable_amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "status" "employee"."final_settlement_status" NOT NULL DEFAULT 'draft',
    "created_by" UUID NOT NULL,
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ,
    "approved_by" UUID,
    "approved_at" TIMESTAMPTZ,
    "paid_by" UUID,
    "paid_at" TIMESTAMPTZ,
    "cancelled_by" UUID,
    "cancelled_at" TIMESTAMPTZ,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "final_payroll_settlements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "final_payroll_settlements_exit_case_id_uq"
    ON "employee"."final_payroll_settlements" ("exit_case_id");
CREATE INDEX "final_payroll_settlements_company_status_idx"
    ON "employee"."final_payroll_settlements" ("company_id", "status");
CREATE INDEX "final_payroll_settlements_employee_id_idx"
    ON "employee"."final_payroll_settlements" ("employee_id");

ALTER TABLE "employee"."final_payroll_settlements"
    ADD CONSTRAINT "final_payroll_settlements_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee"."final_payroll_settlements"
    ADD CONSTRAINT "final_payroll_settlements_exit_case_id_fkey"
    FOREIGN KEY ("exit_case_id") REFERENCES "employee"."employee_exit_cases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee"."final_payroll_settlements"
    ADD CONSTRAINT "final_payroll_settlements_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee"."final_payroll_settlements"
    ADD CONSTRAINT "final_payroll_settlements_payroll_cycle_id_fkey"
    FOREIGN KEY ("payroll_cycle_id") REFERENCES "payroll"."payroll_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
