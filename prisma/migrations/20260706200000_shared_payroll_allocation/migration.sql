-- Shared payroll allocation — master salary split across all active companies

CREATE TYPE "employee"."payroll_allocation_mode" AS ENUM ('standard', 'shared_across_companies');

ALTER TABLE "employee"."employees"
  ADD COLUMN "payroll_allocation_mode" "employee"."payroll_allocation_mode" NOT NULL DEFAULT 'standard',
  ADD COLUMN "master_monthly_salary" DECIMAL(14, 2);
