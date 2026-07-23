import { describe, expect, it } from 'vitest';
import {
  calculateAge,
  calculateTenure,
  daysUntilBirthday,
  formatThaiDate,
  NO_DATA,
} from './employee-date-utils';

describe('employee-date-utils', () => {
  it('formatThaiDate returns Thai long date', () => {
    const formatted = formatThaiDate('1992-08-06');
    expect(formatted).toContain('สิงหาคม');
    expect(formatThaiDate(null)).toBe('—');
  });

  it('calculateAge returns years in Thai', () => {
    const age = calculateAge('1990-01-01');
    expect(age).toMatch(/\d+ ปี/);
    expect(calculateAge(null)).toBe(NO_DATA);
  });

  it('calculateTenure computes work tenure correctly', () => {
    const tenure = calculateTenure('2020-06-01');
    expect(tenure).not.toBe(NO_DATA);
    expect(tenure).toMatch(/(ปี|เดือน)/);
    expect(calculateTenure(null)).toBe(NO_DATA);
  });

  it('daysUntilBirthday returns null when no dob', () => {
    expect(daysUntilBirthday(null)).toBeNull();
  });

  it('daysUntilBirthday returns non-negative days', () => {
    const days = daysUntilBirthday('1992-08-06');
    expect(days).not.toBeNull();
    if (days != null) {
      expect(days).toBeGreaterThanOrEqual(0);
      expect(days).toBeLessThanOrEqual(366);
    }
  });
});
