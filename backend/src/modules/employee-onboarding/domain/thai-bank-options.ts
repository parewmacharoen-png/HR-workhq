// Standard Thai bank options for self-onboarding — codes align with payroll export.

export interface ThaiBankOption {
  label: string;
  value: string;
  code: string;
}

export const SELF_ONBOARDING_BANK_OPTIONS: ThaiBankOption[] = [
  { label: 'กสิกรไทย', value: 'kbank', code: 'KBANK' },
  { label: 'ไทยพาณิชย์', value: 'scb', code: 'SCB' },
  { label: 'กรุงเทพ', value: 'bbl', code: 'BBL' },
  { label: 'กรุงไทย', value: 'ktb', code: 'KTB' },
  { label: 'กรุงศรี', value: 'bay', code: 'BAY' },
  { label: 'ทหารไทยธนชาต', value: 'ttb', code: 'TTB' },
  { label: 'ออมสิน', value: 'gsb', code: 'GSB' },
  { label: 'ธ.ก.ส.', value: 'baac', code: 'BAAC' },
  { label: 'อื่น ๆ', value: 'other', code: 'OTHER' },
];

export function resolveSelfOnboardingBank(value: string): ThaiBankOption | null {
  const normalized = value.trim().toLowerCase();
  return SELF_ONBOARDING_BANK_OPTIONS.find(
    (b) => b.value === normalized || b.code.toLowerCase() === normalized,
  ) ?? null;
}

export function hasValidSelfOnboardingBank(data: {
  bankCode?: string;
  bankName?: string;
}): boolean {
  if (data.bankCode && resolveSelfOnboardingBank(data.bankCode)) return true;
  return false;
}

export function bankDisplayLabel(data: { bankName?: string; bankCode?: string }): string {
  if (data.bankName) return data.bankName;
  const match = data.bankCode ? resolveSelfOnboardingBank(data.bankCode) : null;
  return match?.label ?? data.bankCode ?? '—';
}
