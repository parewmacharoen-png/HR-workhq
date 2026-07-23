import { ProrateService, SALARY_PRORATE_DIVISOR } from './prorate.service';

const prorate = new ProrateService();

function d(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe('ProrateService', () => {
  it('pays full monthly salary when employee works the entire payroll period (25–23)', () => {
    const result = prorate.compute({
      periodStart: d('2026-06-25'),
      periodEnd: d('2026-07-23'),
      bands: [{ monthlySalary: 11_000, effectiveFrom: d('2026-02-07'), effectiveTo: null }],
    });
    expect(result.totalDays).toBe(29);
    expect(result.earnedAmount).toBe(11_000);
    expect(result.bands[0]?.days).toBe(29);
  });

  it('prorates mid-period hire using ÷30 (not calendar days in month)', () => {
    const result = prorate.compute({
      periodStart: d('2026-06-25'),
      periodEnd: d('2026-07-23'),
      bands: [{ monthlySalary: 10_000, effectiveFrom: d('2026-07-02'), effectiveTo: null }],
    });
    // Jul 2 – Jul 23 = 22 days
    expect(result.bands[0]?.days).toBe(22);
    expect(result.bands[0]?.amount).toBe(Math.round((10_000 / SALARY_PRORATE_DIVISOR) * 22 * 100) / 100);
    expect(result.earnedAmount).toBe(7_333.33);
  });

  it('prorates partial period when salary band starts mid-cycle', () => {
    const result = prorate.compute({
      periodStart: d('2026-06-25'),
      periodEnd: d('2026-07-23'),
      bands: [{ monthlySalary: 12_000, effectiveFrom: d('2026-07-10'), effectiveTo: null }],
    });
    expect(result.bands[0]?.days).toBe(14);
    expect(result.earnedAmount).toBe(5_600);
  });
});
