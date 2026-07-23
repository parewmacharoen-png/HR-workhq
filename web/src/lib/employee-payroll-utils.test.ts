import { describe, expect, it } from 'vitest';
import {
  filterPayrollHistory,
  payrollStatusLabel,
  payrollStatusVariant,
  payrollYearOptions,
  salaryTypeLabel,
} from './employee-payroll-utils';
import type { EmployeePayrollHistoryItem } from '../api/employee-payroll';

const base = (overrides: Partial<EmployeePayrollHistoryItem>): EmployeePayrollHistoryItem => ({
  id: 'cycle-1',
  payrollCycleId: 'cycle-1',
  payslipId: 'slip-1',
  periodStart: '2026-05-25',
  periodEnd: '2026-06-23',
  payDate: '2026-06-25',
  baseSalary: 30000,
  mealAllowance: 0,
  mealEligibleDays: 0,
  crossBorderAllowance: 0,
  crossBorderEligibleDays: 0,
  lateDeduction: 0,
  absenceDeduction: 0,
  deposit: 0,
  grossPay: 36000,
  otAmount: 1500,
  commissionAmount: 500,
  bonusAmount: 0,
  deductions: 4000,
  advanceDeduction: 1000,
  netPay: 32000,
  status: 'paid',
  ...overrides,
});

describe('employee payroll utils', () => {
  it('maps payroll status labels and colors', () => {
    expect(payrollStatusLabel('draft')).toBe('ร่าง');
    expect(payrollStatusVariant('calculated')).toBe('info');
    expect(payrollStatusVariant('approved')).toBe('success');
    expect(payrollStatusVariant('paid')).toBe('success');
    expect(payrollStatusVariant('cancelled')).toBe('danger');
    expect(salaryTypeLabel('monthly')).toBe('รายเดือน');
  });

  it('filters by year, status, and search', () => {
    const items = [
      base({ payrollCycleId: 'a' }),
      base({
        payrollCycleId: 'b',
        payDate: '2025-06-25',
        status: 'draft',
      }),
    ];
    expect(filterPayrollHistory(items, { year: '2026', status: '', search: '' })).toHaveLength(1);
    expect(filterPayrollHistory(items, { year: '2025', status: 'draft', search: '' })).toHaveLength(1);
    expect(filterPayrollHistory(items, { year: '', status: '', search: '2026-06' })).toHaveLength(1);
  });

  it('builds year options', () => {
    const items = [
      base({ payDate: '2026-06-25' }),
      base({ payrollCycleId: 'cycle-2', payDate: '2025-06-25' }),
    ];
    expect(payrollYearOptions(items, 2026)).toEqual(['2026', '2025']);
  });
});
