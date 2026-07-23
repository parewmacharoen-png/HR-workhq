// ============================================================================
// modules/settings/domain/settings.types.ts
// ============================================================================

import { SettingCategory } from '@prisma/client';

export { SettingCategory };

export const SETTING_CATEGORIES: SettingCategory[] = [
  'attendance',
  'leave',
  'payroll',
  'referral',
  'deposit',
  'workflow',
  'performance',
  'system',
];

export interface SettingProfileResponse {
  id: string;
  companyId: string | null;
  category: SettingCategory;
  key: string;
  value: unknown;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SettingVersionResponse {
  id: string;
  settingProfileId: string;
  previousValue: unknown | null;
  newValue: unknown;
  changedBy: string;
  changedAt: string;
}

export interface SettingAuditResponse {
  id: string;
  profileId: string | null;
  companyId: string | null;
  category: SettingCategory | null;
  actorId: string;
  action: string;
  key: string;
  oldValue: unknown | null;
  newValue: unknown | null;
  timestamp: string;
}

/** Pure resolution: company → system (team/employee reserved for future). */
export function resolveEffectiveSettingValue(
  companyValue: unknown | undefined | null,
  systemValue: unknown | undefined | null,
): unknown | null {
  if (companyValue !== undefined && companyValue !== null) return companyValue;
  if (systemValue !== undefined && systemValue !== null) return systemValue;
  return null;
}

export function parseSettingCategory(raw: string): SettingCategory {
  if (!SETTING_CATEGORIES.includes(raw as SettingCategory)) {
    throw new Error(`Invalid setting category: ${raw}`);
  }
  return raw as SettingCategory;
}

export function scopeKey(companyId: string | null): string {
  return companyId ?? '00000000-0000-0000-0000-000000000000';
}
