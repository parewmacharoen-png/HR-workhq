-- P0-003: Manual payroll item definitions (recurring / one-time schedules)

CREATE TYPE "payroll"."manual_payroll_item_category" AS ENUM (
  'bonus',
  'commission',
  'ot',
  'meal_allowance',
  'phone_allowance',
  'fuel_allowance',
  'diligence_bonus',
  'travel_allowance',
  'other_earning',
  'utility_deduction',
  'deposit_deduction',
  'advance_deduction',
  'penalty',
  'tax_deduction',
  'other_deduction'
);

CREATE TYPE "payroll"."manual_payroll_schedule_type" AS ENUM (
  'one_time',
  'recurring'
);

CREATE TABLE "payroll"."manual_payroll_item_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "company_id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "category" "payroll"."manual_payroll_item_category" NOT NULL,
  "amount" DECIMAL(14,2) NOT NULL,
  "schedule_type" "payroll"."manual_payroll_schedule_type" NOT NULL,
  "effective_from" DATE NOT NULL,
  "effective_until" DATE,
  "note" TEXT,
  "status" VARCHAR(32) NOT NULL DEFAULT 'active',
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_by" UUID,
  "updated_by" UUID,
  "deleted_at" TIMESTAMPTZ,
  "deleted_by" UUID,

  CONSTRAINT "manual_payroll_item_definitions_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "manual_payroll_item_definitions_company_id_fkey"
    FOREIGN KEY ("company_id") REFERENCES "organization"."companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "manual_payroll_item_definitions_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employee"."employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "manual_payroll_item_definitions_company_id_employee_id_idx"
  ON "payroll"."manual_payroll_item_definitions"("company_id", "employee_id");

CREATE INDEX "manual_payroll_item_definitions_employee_id_status_idx"
  ON "payroll"."manual_payroll_item_definitions"("employee_id", "status");
