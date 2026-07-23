import { describe, expect, it } from 'vitest';
import {
  anniversaryMilestoneFlags,
  formatAgeYears,
  formatEmployeeDateDdMmYyyy,
  formatEmployeeDateThaiLong,
  formatTenureBadge,
  MILESTONE_ANNIVERSARY_COLUMNS,
} from './employee-dates';

describe('employee-dates helpers', () => {
  it('formats profile birthday as DD/MM/YYYY', () => {
    expect(formatEmployeeDateDdMmYyyy('1992-08-06')).toBe('06/08/1992');
    expect(formatEmployeeDateDdMmYyyy(null)).toBe('—');
  });

  it('formats hire date in Thai long form', () => {
    const formatted = formatEmployeeDateThaiLong('2025-01-15');
    expect(formatted).toContain('15');
    expect(formatted).toContain('มกราคม');
  });

  it('formats age in Thai years', () => {
    expect(formatAgeYears(33)).toBe('33 ปี');
    expect(formatAgeYears(null)).toBe('—');
  });

  it('formats tenure badge for cards', () => {
    expect(formatTenureBadge('1 ปี 5 เดือน')).toBe('🕒 อายุงาน 1 ปี 5 เดือน');
    expect(formatTenureBadge(null)).toBeNull();
  });

  it('maps milestone anniversary columns', () => {
    expect(MILESTONE_ANNIVERSARY_COLUMNS).toEqual([1, 2, 3, 5, 10]);
    expect(anniversaryMilestoneFlags(5)[5]).toBe(true);
    expect(anniversaryMilestoneFlags(5)[1]).toBe(false);
  });
});
