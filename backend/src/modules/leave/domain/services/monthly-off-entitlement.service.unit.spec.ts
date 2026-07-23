import { computeMonthlyOffEntitlement } from './monthly-off-entitlement.service';

describe('monthly-off-entitlement.service', () => {
  it('gives full allowance when employed for the whole payroll period', () => {
    const result = computeMonthlyOffEntitlement({
      monthlyOffDays: 4,
      periodStartIso: '2026-05-25',
      periodEndIso: '2026-06-24',
      hireDate: new Date('2020-01-01T00:00:00.000Z'),
    });

    expect(result.prorated).toBe(false);
    expect(result.entitledOffDays).toBe(4);
    expect(result.periodDays).toBe(31);
  });

  it('prorates allowance for half-month employment (15/30 × 4 ≈ 2)', () => {
    const result = computeMonthlyOffEntitlement({
      monthlyOffDays: 4,
      periodStartIso: '2026-05-25',
      periodEndIso: '2026-06-23',
      hireDate: new Date('2026-06-09T00:00:00.000Z'),
    });

    expect(result.prorated).toBe(true);
    expect(result.eligibleEmploymentDays).toBe(15);
    expect(result.periodDays).toBe(30);
    expect(result.entitledOffDays).toBe(2);
  });

  it('returns zero when hire date is after the payroll period', () => {
    const result = computeMonthlyOffEntitlement({
      monthlyOffDays: 4,
      periodStartIso: '2026-05-25',
      periodEndIso: '2026-06-23',
      hireDate: new Date('2026-06-29T00:00:00.000Z'),
    });

    expect(result.entitledOffDays).toBe(0);
    expect(result.prorated).toBe(true);
  });
});
