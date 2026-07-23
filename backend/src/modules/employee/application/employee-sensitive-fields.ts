export function maskNationalId(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length < 4) return '****';
  return `${digits.slice(0, 4)}-XXXX-XXXX-${digits.slice(-3)}`;
}

export function maskSensitiveValue(value: string, visiblePrefix = 0, visibleSuffix = 4): string {
  const trimmed = value.trim();
  if (!trimmed) return '****';
  if (trimmed.length <= visiblePrefix + visibleSuffix) return '*'.repeat(trimmed.length);
  const prefix = visiblePrefix > 0 ? trimmed.slice(0, visiblePrefix) : '';
  const suffix = trimmed.slice(-visibleSuffix);
  return `${prefix}${'*'.repeat(Math.max(4, trimmed.length - visiblePrefix - visibleSuffix))}${suffix}`;
}

export function maskOrReveal(
  value: string | null | undefined,
  canViewSensitive: boolean,
  maskFn: (v: string) => string,
): string | null {
  if (!value) return null;
  return canViewSensitive ? value : maskFn(value);
}
