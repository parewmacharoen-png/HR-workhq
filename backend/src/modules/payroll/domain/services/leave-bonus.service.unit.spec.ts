import {
  computeLeaveBonus,
  toLeaveBonusParams,
} from './leave-bonus.service';
import { DEFAULT_LEAVE_RULES } from '../../../settings/domain/leave-settings.types';

describe('LeaveBonusService', () => {
  const params = toLeaveBonusParams(DEFAULT_LEAVE_RULES);

  it('derives max eligible days from cap and rate', () => {
    expect(params.maxEligibleDays).toBe(2);
    expect(params.monthlyOffDays).toBe(4);
    expect(params.ratePerDay).toBe(600);
  });

  it.each([
    [0, 2, 1200],
    [1, 2, 1200],
    [2, 2, 1200],
    [3, 1, 600],
    [4, 0, 0],
    [5, 0, 0],
  ])('usedOffDays=%i → eligible=%i bonus=%i', (usedOffDays, eligible, bonus) => {
    const result = computeLeaveBonus(params, { usedOffDays });
    expect(result.eligibleBonusDays).toBe(eligible);
    expect(result.bonusAmount).toBe(bonus);
    expect(result.overrideApproved).toBe(false);
  });

  it('owner override removes the normal 2-day cap', () => {
    const result = computeLeaveBonus(params, { usedOffDays: 0, overrideApproved: true });
    expect(result.eligibleBonusDays).toBe(4);
    expect(result.bonusAmount).toBe(2400);
    expect(result.capped).toBe(false);
  });

  it('marks capped when normal rule limits eligible days', () => {
    const result = computeLeaveBonus(params, { usedOffDays: 0 });
    expect(result.capped).toBe(true);
  });

  it('prorates allowance and bonus cap for partial-month employment', () => {
    const prorated = toLeaveBonusParams(DEFAULT_LEAVE_RULES, 2);
    expect(prorated.monthlyOffDays).toBe(2);
    expect(prorated.maxEligibleDays).toBe(2);
    const result = computeLeaveBonus(prorated, { usedOffDays: 0 });
    expect(result.eligibleBonusDays).toBe(2);
    expect(result.bonusAmount).toBe(1200);
  });
});
