-- Deposit collection company for shared payroll staff (deposit not split across companies)

ALTER TABLE "employee"."employees"
  ADD COLUMN "deposit_collection_company_id" UUID;

ALTER TABLE "employee"."employees"
  ADD CONSTRAINT "employees_deposit_collection_company_id_fkey"
  FOREIGN KEY ("deposit_collection_company_id")
  REFERENCES "organization"."companies"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "ix_employees_deposit_collection_company"
  ON "employee"."employees" ("deposit_collection_company_id")
  WHERE "deposit_collection_company_id" IS NOT NULL;
