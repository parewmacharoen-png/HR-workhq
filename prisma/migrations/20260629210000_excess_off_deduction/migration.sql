-- Excess monthly off-day payroll deduction item type
ALTER TYPE "payroll"."item_type" ADD VALUE IF NOT EXISTS 'excess_off_deduction';
