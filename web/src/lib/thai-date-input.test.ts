import { describe, expect, it } from 'vitest';
import { formatIsoDateAsDdMmYyyy, validateThaiDateInput } from './thai-date-input';

describe('thai-date-input', () => {
  it('reads the พ.ศ. year and stores a ค.ศ. ISO date', () => {
    expect(validateThaiDateInput('15/03/2540')).toEqual({ ok: true, iso: '1997-03-15' });
    expect(validateThaiDateInput('1/3/2569')).toEqual({ ok: true, iso: '2026-03-01' });
  });

  it('still accepts a ค.ศ. year typed by habit', () => {
    expect(validateThaiDateInput('15/03/1997')).toEqual({ ok: true, iso: '1997-03-15' });
  });

  it('shows dates with the พ.ศ. year', () => {
    expect(formatIsoDateAsDdMmYyyy('1997-03-15')).toBe('15/03/2540');
  });

  it('explains what is wrong', () => {
    expect(validateThaiDateInput('15-3')).toMatchObject({ ok: false, error: expect.stringContaining('15/03/2540') });
    expect(validateThaiDateInput('31/02/2569')).toMatchObject({ ok: false, error: expect.stringContaining('ไม่มีวันที่ 31') });
    expect(validateThaiDateInput('01/13/2569')).toMatchObject({ ok: false, error: expect.stringContaining('เดือน') });
    expect(validateThaiDateInput('01/01/1800')).toMatchObject({ ok: false, error: expect.stringContaining('ปีไม่ถูกต้อง') });
  });

  it('rejects dates after the allowed maximum', () => {
    expect(validateThaiDateInput('02/01/2569', { maxIso: '2026-01-01' })).toMatchObject({
      ok: false,
      error: 'วันที่ต้องไม่เกิน 01/01/2569',
    });
  });
});
