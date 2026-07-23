// ============================================================================
// modules/settings/domain/deposit-settings.types.unit.spec.ts
// ============================================================================

import {
  DEFAULT_DEPOSIT_RULES,
  mergeDepositRules,
  validateDepositRules,
} from './deposit-settings.types';
import { resolveEffectiveSettingValue } from './settings.types';

describe('deposit-settings.types', () => {
  it('mergeDepositRules uses defaults when value is missing', () => {
    expect(mergeDepositRules(null).monthlyDeductionAmount).toBe(500);
    expect(mergeDepositRules(null).maximumBalanceAmount).toBe(3000);
  });

  it('mergeDepositRules overlays company fields', () => {
    const merged = mergeDepositRules({ monthlyDeductionAmount: 400, maximumBalanceAmount: 2000 });
    expect(merged.monthlyDeductionAmount).toBe(400);
    expect(merged.maximumBalanceAmount).toBe(2000);
    expect(merged.deductionItemType).toBe('deposit');
  });

  it('resolveEffectiveSettingValue prefers company deposit rules', () => {
    const company = { monthlyDeductionAmount: 600 };
    const system = { monthlyDeductionAmount: 500 };
    expect(resolveEffectiveSettingValue(company, system)).toEqual(company);
  });

  it('validateDepositRules rejects cap below monthly deduction when enabled', () => {
    const errors = validateDepositRules({
      ...DEFAULT_DEPOSIT_RULES,
      enabled: true,
      monthlyDeductionAmount: 800,
      maximumBalanceAmount: 500,
    });
    expect(errors.some((e) => e.includes('maximumBalanceAmount'))).toBe(true);
  });

  it('validateDepositRules rejects negative monthly deduction', () => {
    const errors = validateDepositRules({
      ...DEFAULT_DEPOSIT_RULES,
      monthlyDeductionAmount: -100,
    });
    expect(errors.some((e) => e.includes('monthlyDeductionAmount'))).toBe(true);
  });
});
