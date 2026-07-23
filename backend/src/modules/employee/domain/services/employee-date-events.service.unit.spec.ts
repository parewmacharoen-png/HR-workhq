// ============================================================================
// modules/employee/domain/services/employee-date-events.service.unit.spec.ts
// ============================================================================

import {
  bangkokCalendarParts,
  calculateAgeYears,
  calculateTenureBreakdown,
  calculateTenureParts,
  completeAnniversaryYears,
  daysInMonth,
  formatDateDdMmYyyy,
  formatIsoDateAsDdMmYyyy,
  formatTenureDisplay,
  formatTenureDisplayDetailed,
  isLeapYear,
  parseDateDdMmYyyyInput,
  isMilestoneAnniversaryYear,
  isSameMonthDay,
  occursInMonth,
  nextMilestoneAnniversary,
  resolveProbationStatus,
  upcomingSortKey,
} from './employee-date-events.service';

describe('EmployeeDateEventsService', () => {
  const asOf = new Date('2026-06-23T02:00:00.000Z');

  describe('calculateTenureBreakdown', () => {
    it('returns 1 ปี 5 เดือน 8 วัน for hire Jan 15 2025', () => {
      const breakdown = calculateTenureBreakdown(new Date('2025-01-15'), asOf);
      expect(breakdown.years).toBe(1);
      expect(breakdown.months).toBe(5);
      expect(breakdown.days).toBe(8);
    });

    it('returns days only when less than one month', () => {
      const breakdown = calculateTenureBreakdown(new Date('2026-06-11'), asOf);
      expect(breakdown.years).toBe(0);
      expect(breakdown.months).toBe(0);
      expect(breakdown.days).toBe(12);
      expect(formatTenureDisplay(breakdown)).toBe('12 วัน');
    });

    it('returns months and days when less than one year', () => {
      const breakdown = calculateTenureBreakdown(new Date('2025-10-08'), asOf);
      expect(breakdown.years).toBe(0);
      expect(breakdown.months).toBe(8);
      expect(breakdown.days).toBe(15);
      expect(formatTenureDisplay(breakdown)).toBe('8 เดือน 15 วัน');
    });

    it('handles leap year February correctly', () => {
      expect(isLeapYear(2024)).toBe(true);
      expect(daysInMonth(2024, 2)).toBe(29);
      const breakdown = calculateTenureBreakdown(
        new Date('2024-02-29'),
        new Date('2025-03-01T02:00:00.000Z'),
      );
      expect(breakdown.years).toBe(1);
      expect(breakdown.months).toBe(0);
      expect(breakdown.days).toBe(0);
    });
  });

  describe('formatTenureDisplay / formatTenureDisplayDetailed', () => {
    it('omits days in standard display when 1+ years', () => {
      const breakdown = calculateTenureBreakdown(new Date('2025-01-15'), asOf);
      expect(formatTenureDisplay(breakdown)).toBe('1 ปี 5 เดือน');
      expect(formatTenureDisplayDetailed(breakdown)).toBe('1 ปี 5 เดือน 8 วัน');
    });

    it('formats multi-year tenure without days', () => {
      const breakdown = calculateTenureBreakdown(new Date('2021-03-22'), asOf);
      expect(formatTenureDisplay(breakdown)).toBe('5 ปี 3 เดือน');
    });
  });

  describe('calculateTenureParts (legacy)', () => {
    it('returns year and month components', () => {
      const parts = calculateTenureParts(new Date('2024-01-15'), asOf);
      expect(parts.years).toBe(2);
      expect(parts.months).toBe(5);
    });
  });

  describe('calculateAgeYears', () => {
    it('computes age before birthday in the year', () => {
      expect(calculateAgeYears(new Date('1992-08-06'), asOf)).toBe(33);
    });
  });

  describe('completeAnniversaryYears', () => {
    it('returns completed full years before anniversary day', () => {
      expect(completeAnniversaryYears(new Date('2020-06-25'), asOf)).toBe(5);
    });
  });

  describe('resolveProbationStatus', () => {
    it('returns passed label for active employees', () => {
      expect(resolveProbationStatus('active')).toEqual({
        code: 'passed',
        label: 'ผ่านทดลองงานแล้ว',
      });
    });

    it('returns on-probation label for probation employees', () => {
      expect(resolveProbationStatus('probation')).toEqual({
        code: 'on_probation',
        label: 'อยู่ระหว่างทดลองงาน',
      });
    });
  });

  describe('nextMilestoneAnniversary', () => {
    it('returns next milestone year for upcoming anniversary', () => {
      expect(nextMilestoneAnniversary(new Date('2020-01-15'), asOf)).toEqual({
        years: 10,
        label: 'ครบ 10 ปี',
      });
    });
  });

  describe('isMilestoneAnniversaryYear', () => {
    it('accepts milestone years only', () => {
      expect(isMilestoneAnniversaryYear(5)).toBe(true);
      expect(isMilestoneAnniversaryYear(4)).toBe(false);
    });
  });

  describe('formatDateDdMmYyyy', () => {
    it('formats as DD/MM/YYYY in Bangkok', () => {
      expect(formatDateDdMmYyyy(new Date('1992-08-06'))).toBe('06/08/1992');
    });
  });

  describe('parseDateDdMmYyyyInput', () => {
    it('parses DD/MM/YYYY to ISO', () => {
      expect(parseDateDdMmYyyyInput('15/06/2017')).toBe('2017-06-15');
      expect(parseDateDdMmYyyyInput('6/8/1992')).toBe('1992-08-06');
      expect(parseDateDdMmYyyyInput('15-06-2017')).toBe('2017-06-15');
    });

    it('rejects invalid dates', () => {
      expect(parseDateDdMmYyyyInput('31/02/2017')).toBeNull();
      expect(parseDateDdMmYyyyInput('abc')).toBeNull();
    });
  });

  describe('formatIsoDateAsDdMmYyyy', () => {
    it('formats ISO as DD/MM/YYYY', () => {
      expect(formatIsoDateAsDdMmYyyy('2017-06-15')).toBe('15/06/2017');
    });
  });

  describe('occursInMonth / isSameMonthDay', () => {
    it('matches month/day in Bangkok', () => {
      const dob = new Date('1992-08-06');
      expect(occursInMonth(dob, new Date('2025-08-01'))).toBe(true);
      expect(isSameMonthDay(dob, new Date('2025-08-06'))).toBe(true);
    });
  });

  describe('upcomingSortKey', () => {
    it('sorts upcoming days before past days in month', () => {
      const ref = bangkokCalendarParts(asOf);
      expect(upcomingSortKey(25, ref)).toBeLessThan(upcomingSortKey(10, ref));
    });
  });
});
