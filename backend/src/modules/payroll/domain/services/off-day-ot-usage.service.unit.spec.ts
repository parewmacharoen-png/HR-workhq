import {
  countOffDayUnits,
  offDayUnitsForLeaveType,
  previewOtBonus,
} from './off-day-ot-usage.service';
import { DEFAULT_LEAVE_RULES } from '../../../settings/domain/leave-settings.types';

describe('offDayUnitsForLeaveType', () => {
  it('emergency counts as 2 units', () => {
    expect(offDayUnitsForLeaveType('emergency')).toBe(2);
    expect(offDayUnitsForLeaveType('sick')).toBe(1);
  });
});

describe('countOffDayUnits / OT preview', () => {
  const rules = DEFAULT_LEAVE_RULES;

  it('2 monthly off + 1 emergency => 0 OT days', () => {
    const units = countOffDayUnits({
      periodStartIso: '2026-06-25',
      periodEndIso: '2026-07-24',
      monthlyOffRows: [{ selectedDates: ['2026-07-01', '2026-07-02'], status: 'approved' }],
      leaveRows: [{
        startDate: new Date('2026-07-03T00:00:00.000Z'),
        endDate: new Date('2026-07-03T00:00:00.000Z'),
        status: 'approved',
        leaveTypeCode: 'emergency',
      }],
    });
    expect(units).toBe(4);
    expect(previewOtBonus(rules, units).eligibleBonusDays).toBe(0);
  });

  it('1 monthly off + 1 emergency => 1 OT day', () => {
    const units = countOffDayUnits({
      periodStartIso: '2026-06-25',
      periodEndIso: '2026-07-24',
      monthlyOffRows: [{ selectedDates: ['2026-07-01'], status: 'approved' }],
      leaveRows: [{
        startDate: new Date('2026-07-03T00:00:00.000Z'),
        endDate: new Date('2026-07-03T00:00:00.000Z'),
        status: 'approved',
        leaveTypeCode: 'emergency',
      }],
    });
    expect(units).toBe(3);
    expect(previewOtBonus(rules, units).eligibleBonusDays).toBe(1);
    expect(previewOtBonus(rules, units).bonusAmount).toBe(600);
  });
});
