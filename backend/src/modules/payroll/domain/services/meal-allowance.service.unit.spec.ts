import { computeMealAllowance } from './meal-allowance.service';

describe('MealAllowanceService', () => {
  it('computes 100 THB per eligible day', () => {
    const result = computeMealAllowance({ ratePerDay: 100 }, { eligibleDays: 30 });
    expect(result.amount).toBe(3000);
  });

  it('returns zero for WFH-style zero eligible days', () => {
    const result = computeMealAllowance({ ratePerDay: 100 }, { eligibleDays: 0 });
    expect(result.amount).toBe(0);
  });
});
