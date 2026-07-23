-- HR-16A: employee work category + payroll late_deduction item type
CREATE TYPE employee.employee_work_category AS ENUM ('office', 'wfh');

ALTER TABLE employee.employees
  ADD COLUMN work_category employee.employee_work_category NOT NULL DEFAULT 'office';

ALTER TYPE payroll.item_type ADD VALUE IF NOT EXISTS 'late_deduction';
ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'attendance';
