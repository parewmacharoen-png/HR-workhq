// ============================================================================
// modules/settings/domain/payroll-settings.types.ts
// ============================================================================

export const PAYROLL_RULES_SETTING_KEY = 'rules';

export interface PayrollRulesSetting {
  mealAllowancePerDay: number;
  /** Per office check-in day commute / cross-border allowance. */
  crossBorderAllowancePerDay: number;
}

export const DEFAULT_PAYROLL_RULES: PayrollRulesSetting = {
  mealAllowancePerDay: 100,
  crossBorderAllowancePerDay: 100,
};

export function mergePayrollRules(raw: unknown | null | undefined): PayrollRulesSetting {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_PAYROLL_RULES };
  }
  const partial = raw as Record<string, unknown>;
  const mealAllowancePerDay = typeof partial.mealAllowancePerDay === 'number'
    && !Number.isNaN(partial.mealAllowancePerDay)
    ? partial.mealAllowancePerDay
    : DEFAULT_PAYROLL_RULES.mealAllowancePerDay;

  let crossBorderAllowancePerDay = DEFAULT_PAYROLL_RULES.crossBorderAllowancePerDay;
  if (typeof partial.crossBorderAllowancePerDay === 'number' && !Number.isNaN(partial.crossBorderAllowancePerDay)) {
    crossBorderAllowancePerDay = partial.crossBorderAllowancePerDay;
  } else if (
    typeof partial.crossBorderAllowancePerMonth === 'number'
    && !Number.isNaN(partial.crossBorderAllowancePerMonth)
  ) {
    // Legacy monthly setting: large values were monthly totals — fall back to default daily rate.
    crossBorderAllowancePerDay = partial.crossBorderAllowancePerMonth >= 500
      ? DEFAULT_PAYROLL_RULES.crossBorderAllowancePerDay
      : partial.crossBorderAllowancePerMonth;
  }

  return { mealAllowancePerDay, crossBorderAllowancePerDay };
}

export function validatePayrollRules(rules: PayrollRulesSetting): string[] {
  const errors: string[] = [];
  if (
    typeof rules.mealAllowancePerDay !== 'number'
    || Number.isNaN(rules.mealAllowancePerDay)
    || rules.mealAllowancePerDay < 0
  ) {
    errors.push('mealAllowancePerDay must be a non-negative number');
  }
  if (
    typeof rules.crossBorderAllowancePerDay !== 'number'
    || Number.isNaN(rules.crossBorderAllowancePerDay)
    || rules.crossBorderAllowancePerDay < 0
  ) {
    errors.push('crossBorderAllowancePerDay must be a non-negative number');
  }
  return errors;
}

export function cacheKeyForCompany(companyId: string | null): string {
  return companyId ?? 'system';
}
