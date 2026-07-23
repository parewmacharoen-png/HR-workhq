import { describe, expect, it } from 'vitest';
import { defaultPayrollPeriodDates } from './payroll';

describe('payroll API helpers', () => {
  it('defaultPayrollPeriodDates uses 25th–23rd window', () => {
    const d = defaultPayrollPeriodDates(new Date('2026-07-15'));
    expect(d.periodStart).toBe('2026-06-25');
    expect(d.periodEnd).toBe('2026-07-23');
    expect(d.payDate).toBe('2026-07-25');
  });

  it('defaultPayrollPeriodDates handles January rollover', () => {
    const d = defaultPayrollPeriodDates(new Date('2026-01-10'));
    expect(d.periodStart).toBe('2025-12-25');
    expect(d.periodEnd).toBe('2026-01-23');
    expect(d.payDate).toBe('2026-01-25');
  });
});
