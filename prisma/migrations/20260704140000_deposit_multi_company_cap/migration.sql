-- Allow deposit ledger totals across companies (e.g. SB 3000 + KW 1000).
-- Monthly payroll deduction still respects settings.maximumBalanceAmount in app code.
ALTER TABLE payroll.deposits DROP CONSTRAINT IF EXISTS ck_deposit_cap;
