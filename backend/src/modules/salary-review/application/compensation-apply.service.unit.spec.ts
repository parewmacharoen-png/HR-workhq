import { computeIncrease } from './compensation-apply.service';

describe('computeIncrease', () => {
  it('computes amount and percent for a raise', () => {
    expect(computeIncrease(30000, 33000)).toEqual({
      increaseAmount: 3000,
      increasePercent: 10,
    });
  });

  it('handles zero current salary', () => {
    expect(computeIncrease(0, 25000)).toEqual({
      increaseAmount: 25000,
      increasePercent: 0,
    });
  });

  it('rounds to two decimal places', () => {
    expect(computeIncrease(33333, 35000)).toEqual({
      increaseAmount: 1667,
      increasePercent: 5,
    });
  });
});
