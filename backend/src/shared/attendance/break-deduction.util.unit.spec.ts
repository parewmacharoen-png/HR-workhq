import { computeBreakDeduction } from '../../../shared/attendance/break-deduction.util';
import { DEFAULT_ATTENDANCE_RULES } from '../../../settings/domain/attendance-settings.types';

describe('break-deduction.util', () => {
  const hourlyRate = 50;
  const rules = { ...DEFAULT_ATTENDANCE_RULES };

  it('no deduction within allowed break', () => {
    const result = computeBreakDeduction(60, rules, hourlyRate);
    expect(result.tier).toBe('none');
    expect(result.breakDeduction).toBe(0);
  });

  it('hourly deduction on overage up to 2h total', () => {
    const result = computeBreakDeduction(90, rules, hourlyRate);
    expect(result.tier).toBe('hourly');
    expect(result.breakDeduction).toBe(100);
  });

  it('half day tier when total break exceeds 2h', () => {
    const result = computeBreakDeduction(150, rules, hourlyRate);
    expect(result.tier).toBe('half_day');
    expect(result.breakDeduction).toBe(400);
  });

  it('full day tier when total break exceeds 4h', () => {
    const result = computeBreakDeduction(270, rules, hourlyRate);
    expect(result.tier).toBe('full_day');
    expect(result.breakDeduction).toBe(800);
  });

  it('absence tier when total break exceeds 6h', () => {
    const result = computeBreakDeduction(400, rules, hourlyRate);
    expect(result.tier).toBe('absence');
    expect(result.breakDeduction).toBe(0);
  });
});
