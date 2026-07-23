// ============================================================================
// modules/settings/domain/referral-settings.types.ts
// ============================================================================

export const REFERRAL_RULES_SETTING_KEY = 'rules';

export type ReferralPayoutMode = 'one_time';

export interface ReferralRulesSetting {
  rewardAmount: number;
  requiredEmploymentDays: number;
  payoutMode: ReferralPayoutMode;
  autoCreatePayrollItem: boolean;
  allowMultipleReferrals: boolean;
  duplicateCheckEnabled: boolean;
}

export const DEFAULT_REFERRAL_RULES: ReferralRulesSetting = {
  rewardAmount: 2000,
  requiredEmploymentDays: 90,
  payoutMode: 'one_time',
  autoCreatePayrollItem: true,
  allowMultipleReferrals: true,
  duplicateCheckEnabled: true,
};

export const MS_PER_DAY = 86_400_000;

export function requiredEmploymentMs(days: number): number {
  return days * MS_PER_DAY;
}

export function mergeReferralRules(raw: unknown | null | undefined): ReferralRulesSetting {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_REFERRAL_RULES };
  }
  return { ...DEFAULT_REFERRAL_RULES, ...(raw as Partial<ReferralRulesSetting>) };
}

export function normalizeReferralRules(rules: ReferralRulesSetting): ReferralRulesSetting {
  return mergeReferralRules(rules);
}

export function validateReferralRules(rules: ReferralRulesSetting): string[] {
  const errors: string[] = [];
  if (typeof rules.rewardAmount !== 'number' || Number.isNaN(rules.rewardAmount) || rules.rewardAmount < 0) {
    errors.push('rewardAmount must be a non-negative number');
  }
  if (
    typeof rules.requiredEmploymentDays !== 'number'
    || Number.isNaN(rules.requiredEmploymentDays)
    || rules.requiredEmploymentDays < 0
  ) {
    errors.push('requiredEmploymentDays must be a non-negative number');
  }
  if (rules.payoutMode !== 'one_time') {
    errors.push('payoutMode must be one_time');
  }
  return errors;
}

export function cacheKeyForCompany(companyId: string | null): string {
  return companyId ?? 'system';
}
