-- Restore global deposit cap (max running_total 3000 THB).
ALTER TABLE payroll.deposits DROP CONSTRAINT IF EXISTS ck_deposit_cap;
ALTER TABLE payroll.deposits
  ADD CONSTRAINT ck_deposit_cap CHECK (running_total <= 3000);
