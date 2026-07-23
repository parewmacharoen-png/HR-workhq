import {
  clampSalaryBandsToHireDate,
  resolveInitialSalaryEffectiveDate,
} from './salary-band-employment.util';

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('salary-band-employment.util', () => {
  it('backdates late salary entry to period start when hire was before period', () => {
    const bands = clampSalaryBandsToHireDate(
      [{ monthlySalary: 10_000, effectiveFrom: d('2026-07-02'), effectiveTo: null }],
      d('2026-06-01'),
      d('2026-06-25'),
      d('2026-07-23'),
    );
    expect(bands[0]?.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-06-25');
  });

  it('keeps hire date when employee started mid-period', () => {
    const bands = clampSalaryBandsToHireDate(
      [{ monthlySalary: 10_000, effectiveFrom: d('2026-07-02'), effectiveTo: null }],
      d('2026-07-02'),
      d('2026-06-25'),
      d('2026-07-23'),
    );
    expect(bands[0]?.effectiveFrom.toISOString().slice(0, 10)).toBe('2026-07-02');
  });

  it('uses hire date for initial salary effective date when HR entered later', () => {
    const effective = resolveInitialSalaryEffectiveDate(
      d('2026-07-02'),
      d('2026-06-01'),
      false,
    );
    expect(effective.toISOString().slice(0, 10)).toBe('2026-06-01');
  });
});
