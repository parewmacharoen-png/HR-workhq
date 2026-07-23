import { describe, expect, it } from 'vitest';
import { maskNationalId, maskOrReveal, maskSensitiveValue } from './employee-sensitive-fields';

describe('employee-sensitive-fields', () => {
  it('masks national ID', () => {
    expect(maskNationalId('1234567890123')).toMatch(/1234-XXXX-XXXX-123/);
  });

  it('reveals when allowed', () => {
    expect(maskOrReveal('1234567890123', true, maskNationalId)).toBe('1234567890123');
  });

  it('masks when not allowed', () => {
    expect(maskOrReveal('1234567890123', false, maskNationalId)).toMatch(/XXXX/);
  });

  it('masks generic sensitive values', () => {
    expect(maskSensitiveValue('TAX123456')).toMatch(/\*+3456/);
  });
});
