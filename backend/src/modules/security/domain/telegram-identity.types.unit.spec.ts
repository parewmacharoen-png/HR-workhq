// ============================================================================
// modules/security/domain/telegram-identity.types.unit.spec.ts
// ============================================================================

import { normalizePhone, phonesMatch } from './telegram-identity.types';

describe('telegram-identity.types', () => {
  it('normalizePhone compares Thai mobile numbers', () => {
    expect(normalizePhone('0812345678')).toBe(normalizePhone('812345678'));
    expect(normalizePhone('+66812345678')).toBe(normalizePhone('0812345678'));
  });

  it('phonesMatch returns true for equivalent numbers', () => {
    expect(phonesMatch('0812345678', '812345678')).toBe(true);
  });

  it('phonesMatch returns false when missing', () => {
    expect(phonesMatch(null, '0812345678')).toBe(false);
  });
});
