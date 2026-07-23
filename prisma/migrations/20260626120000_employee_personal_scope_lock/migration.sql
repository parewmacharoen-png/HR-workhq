-- Employee Personal Tab scope lock: demographic fields + passport document type

ALTER TABLE employee.employees
  ADD COLUMN IF NOT EXISTS nationality VARCHAR(80),
  ADD COLUMN IF NOT EXISTS religion VARCHAR(80),
  ADD COLUMN IF NOT EXISTS marital_status VARCHAR(40);

ALTER TYPE employee.document_type ADD VALUE IF NOT EXISTS 'passport';
