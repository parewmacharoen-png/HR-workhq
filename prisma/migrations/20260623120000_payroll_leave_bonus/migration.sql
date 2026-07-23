-- Add leave_bonus payroll item and source reference types
ALTER TYPE payroll.item_type ADD VALUE IF NOT EXISTS 'leave_bonus';
ALTER TYPE payroll.source_ref_type ADD VALUE IF NOT EXISTS 'leave_bonus';
