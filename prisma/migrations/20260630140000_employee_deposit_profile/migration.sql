-- Employee deposit profile: opt-out + legacy collector company for pre-system deposits

ALTER TABLE "employee"."employees"
  ADD COLUMN IF NOT EXISTS "deposit_deduction_exempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "legacy_deposit_amount" DECIMAL(12, 2),
  ADD COLUMN IF NOT EXISTS "legacy_deposit_company_id" UUID;

ALTER TABLE "employee"."employees"
  ADD CONSTRAINT "employees_legacy_deposit_company_id_fkey"
  FOREIGN KEY ("legacy_deposit_company_id")
  REFERENCES "organization"."companies"("id")
  ON DELETE SET NULL
  ON UPDATE CASCADE;
