// ============================================================================
// modules/settings/domain/referral-settings.types.unit.spec.ts
// ============================================================================

import {
  DEFAULT_REFERRAL_RULES,
  mergeReferralRules,
  validateReferralRules,
} from './referral-settings.types';
import { resolveEffectiveSettingValue } from './settings.types';

describe('referral-settings.types', () => {
  it('mergeReferralRules uses defaults when value is missing', () => {
    expect(mergeReferralRules(null).rewardAmount).toBe(2000);
    expect(mergeReferralRules(null).requiredEmploymentDays).toBe(90);
  });

  it('mergeReferralRules overlays company fields', () => {
    const merged = mergeReferralRules({ rewardAmount: 2500, requiredEmploymentDays: 60 });
    expect(merged.rewardAmount).toBe(2500);
    expect(merged.requiredEmploymentDays).toBe(60);
    expect(merged.autoCreatePayrollItem).toBe(true);
  });

  it('resolveEffectiveSettingValue prefers company referral rules', () => {
    const company = { rewardAmount: 3000 };
    const system = { rewardAmount: 2000 };
    expect(resolveEffectiveSettingValue(company, system)).toEqual(company);
  });

  it('validateReferralRules rejects negative reward amount', () => {
    const errors = validateReferralRules({
      ...DEFAULT_REFERRAL_RULES,
      rewardAmount: -1,
    });
    expect(errors.some((e) => e.includes('rewardAmount'))).toBe(true);
  });

  it('validateReferralRules rejects unsupported payout mode', () => {
    const errors = validateReferralRules({
      ...DEFAULT_REFERRAL_RULES,
      payoutMode: 'monthly' as never,
    });
    expect(errors).toContain('payoutMode must be one_time');
  });
});
