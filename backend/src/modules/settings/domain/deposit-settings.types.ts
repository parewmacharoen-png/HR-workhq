// ============================================================================
// modules/settings/domain/deposit-settings.types.ts
// ============================================================================

export const DEPOSIT_RULES_SETTING_KEY = 'rules';

export interface DepositRulesSetting {
  enabled: boolean;
  monthlyDeductionAmount: number;
  maximumBalanceAmount: number;
  minimumNetPayAfterDeposit: number;
  deductionItemType: string;
  refundOnProperResignation: boolean;
  allowPartialRefund: boolean;
  refundRequiresApproval: boolean;
}

export const DEFAULT_DEPOSIT_RULES: DepositRulesSetting = {
  enabled: true,
  monthlyDeductionAmount: 500,
  maximumBalanceAmount: 3000,
  minimumNetPayAfterDeposit: 0,
  deductionItemType: 'deposit',
  refundOnProperResignation: true,
  allowPartialRefund: true,
  refundRequiresApproval: true,
};

export function mergeDepositRules(raw: unknown | null | undefined): DepositRulesSetting {
  if (raw === null || raw === undefined || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...DEFAULT_DEPOSIT_RULES };
  }
  return { ...DEFAULT_DEPOSIT_RULES, ...(raw as Partial<DepositRulesSetting>) };
}

export function normalizeDepositRules(rules: DepositRulesSetting): DepositRulesSetting {
  return mergeDepositRules(rules);
}

export function validateDepositRules(rules: DepositRulesSetting): string[] {
  const errors: string[] = [];
  if (
    typeof rules.monthlyDeductionAmount !== 'number'
    || Number.isNaN(rules.monthlyDeductionAmount)
    || rules.monthlyDeductionAmount < 0
  ) {
    errors.push('monthlyDeductionAmount must be a non-negative number');
  }
  if (
    typeof rules.maximumBalanceAmount !== 'number'
    || Number.isNaN(rules.maximumBalanceAmount)
    || rules.maximumBalanceAmount < 0
  ) {
    errors.push('maximumBalanceAmount must be a non-negative number');
  }
  if (!rules.deductionItemType?.trim()) {
    errors.push('deductionItemType is required');
  }
  if (
    rules.enabled
    && rules.maximumBalanceAmount < rules.monthlyDeductionAmount
  ) {
    errors.push('maximumBalanceAmount must be >= monthlyDeductionAmount when deposit is enabled');
  }
  if (
    typeof rules.minimumNetPayAfterDeposit !== 'number'
    || Number.isNaN(rules.minimumNetPayAfterDeposit)
    || rules.minimumNetPayAfterDeposit < 0
  ) {
    errors.push('minimumNetPayAfterDeposit must be a non-negative number');
  }
  return errors;
}

export function cacheKeyForCompany(companyId: string | null): string {
  return companyId ?? 'system';
}
