// ============================================================================
// modules/settings/domain/settings.types.unit.spec.ts
// ============================================================================

import { resolveEffectiveSettingValue } from './settings.types';

describe('resolveEffectiveSettingValue', () => {
  it('returns company value when present', () => {
    expect(resolveEffectiveSettingValue(2000, 1500)).toBe(2000);
    expect(resolveEffectiveSettingValue({ a: 1 }, { a: 2 })).toEqual({ a: 1 });
  });

  it('falls back to system value when company value is null or undefined', () => {
    expect(resolveEffectiveSettingValue(null, 1500)).toBe(1500);
    expect(resolveEffectiveSettingValue(undefined, 1500)).toBe(1500);
  });

  it('returns null when neither level is set', () => {
    expect(resolveEffectiveSettingValue(null, null)).toBeNull();
    expect(resolveEffectiveSettingValue(undefined, undefined)).toBeNull();
  });

  it('company zero/false values are not skipped', () => {
    expect(resolveEffectiveSettingValue(0, 100)).toBe(0);
    expect(resolveEffectiveSettingValue(false, true)).toBe(false);
  });
});
