// ============================================================================
// modules/employee/application/employee-events.service.unit.spec.ts
// ============================================================================

import { EmployeeEventsService } from './employee-events.service';

describe('EmployeeEventsService (unit)', () => {
  const service = new EmployeeEventsService({} as never, {} as never);
  const asOf = new Date('2026-06-23T02:00:00.000Z');

  describe('buildTenureInfo', () => {
    it('returns tenure API fields', () => {
      const result = service.buildTenureInfo(new Date('2025-01-15'), asOf);
      expect(result.hireDate).toBe('2025-01-15');
      expect(result.tenureYears).toBe(1);
      expect(result.tenureMonths).toBe(5);
      expect(result.tenureDays).toBe(8);
      expect(result.tenureDisplay).toBe('1 ปี 5 เดือน');
      expect(result.tenureDisplayDetailed).toBe('1 ปี 5 เดือน 8 วัน');
    });
  });

  describe('buildProfileDates', () => {
    it('returns birthday, tenure, and probation status', () => {
      const result = service.buildProfileDates(
        new Date('1992-08-06'),
        new Date('2025-01-15'),
        'active',
        asOf,
      );
      expect(result.dateOfBirth).toBe('1992-08-06');
      expect(result.ageYears).toBe(33);
      expect(result.tenureDisplay).toBe('1 ปี 5 เดือน');
      expect(result.tenureDisplayDetailed).toBe('1 ปี 5 เดือน 8 วัน');
      expect(result.probationStatus).toBe('ผ่านทดลองงานแล้ว');
      expect(result.probationStatusCode).toBe('passed');
    });

    it('handles missing birth date', () => {
      const result = service.buildProfileDates(null, new Date('2025-01-15'), 'probation', asOf);
      expect(result.dateOfBirth).toBeNull();
      expect(result.ageYears).toBeNull();
      expect(result.probationStatusCode).toBe('on_probation');
    });
  });
});
