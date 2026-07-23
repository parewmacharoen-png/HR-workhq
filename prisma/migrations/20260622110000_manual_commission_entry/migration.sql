-- Manual commission entry for externally calculated commission amounts (HR payroll)

CREATE TYPE payroll.manual_commission_type AS ENUM (
  'marketing_manual',
  'sales_manual',
  'other_manual'
);

ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'manual_commission';

CREATE TABLE payroll.manual_commission_entries (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id          UUID NOT NULL REFERENCES employee.employees(id),
  company_id           UUID NOT NULL REFERENCES organization.companies(id),
  payroll_cycle_id     UUID NOT NULL REFERENCES payroll.payroll_cycles(id),
  payroll_item_id      UUID NOT NULL UNIQUE REFERENCES payroll.payroll_items(id),
  amount               NUMERIC(14, 2) NOT NULL CHECK (amount > 0),
  commission_type      payroll.manual_commission_type NOT NULL,
  description          TEXT,
  reason               TEXT NOT NULL,
  source_document_url  VARCHAR(2048),
  idempotency_key      VARCHAR(128) UNIQUE,
  created_by           UUID NOT NULL,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at             TIMESTAMPTZ
);

CREATE INDEX manual_commission_entries_cycle_employee_idx
  ON payroll.manual_commission_entries (payroll_cycle_id, employee_id)
  WHERE deleted_at IS NULL;

CREATE INDEX manual_commission_entries_company_created_idx
  ON payroll.manual_commission_entries (company_id, created_at DESC)
  WHERE deleted_at IS NULL;
