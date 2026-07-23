import {
  DEFAULT_PAYROLL_RULES,
  mergePayrollRules,
  validatePayrollRules,
} from './payroll-settings.types';

describe('payroll-settings.types', () => {
  it('validates mealAllowancePerDay', () => {
    expect(validatePayrollRules({ ...DEFAULT_PAYROLL_RULES, mealAllowancePerDay: -1 })).toEqual([
      'mealAllowancePerDay must be a non-negative number',
    ]);
  });

  it('defaults crossBorderAllowancePerDay to 100', () => {
    expect(mergePayrollRules({ mealAllowancePerDay: 100 }).crossBorderAllowancePerDay).toBe(100);
  });

  it('reads crossBorderAllowancePerDay when present', () => {
    expect(mergePayrollRules({
      mealAllowancePerDay: 100,
      crossBorderAllowancePerDay: 150,
    }).crossBorderAllowancePerDay).toBe(150);
  });

  it('maps legacy monthly setting of 2000 to default daily rate', () => {
    expect(mergePayrollRules({
      mealAllowancePerDay: 100,
      crossBorderAllowancePerMonth: 2000,
    }).crossBorderAllowancePerDay).toBe(100);
  });

  it('validates crossBorderAllowancePerDay', () => {
    expect(validatePayrollRules({ ...DEFAULT_PAYROLL_RULES, crossBorderAllowancePerDay: -1 })).toEqual([
      'crossBorderAllowancePerDay must be a non-negative number',
    ]);
  });
});
