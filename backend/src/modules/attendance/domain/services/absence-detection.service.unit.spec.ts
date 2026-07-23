// ============================================================================
// modules/attendance/domain/services/absence-detection.service.unit.spec.ts
// ============================================================================

import { isAbsenceCandidate, isEmployeeActiveOnDate } from './absence-detection.service';

describe('absence-detection.service', () => {
  describe('isAbsenceCandidate', () => {
    const base = {
      hasApprovedLeave: false,
      hasApprovedMonthlyOff: false,
      isHoliday: false,
      hasCheckIn: false,
      isActiveOnDate: true,
    };

    it('flags when active workday with no check-in', () => {
      expect(isAbsenceCandidate(base)).toBe(true);
    });

    it('skips when approved leave exists', () => {
      expect(isAbsenceCandidate({ ...base, hasApprovedLeave: true })).toBe(false);
    });

    it('skips when approved monthly off exists', () => {
      expect(isAbsenceCandidate({ ...base, hasApprovedMonthlyOff: true })).toBe(false);
    });

    it('skips on holiday', () => {
      expect(isAbsenceCandidate({ ...base, isHoliday: true })).toBe(false);
    });

    it('skips when check-in exists', () => {
      expect(isAbsenceCandidate({ ...base, hasCheckIn: true })).toBe(false);
    });

    it('skips when employee inactive on date', () => {
      expect(isAbsenceCandidate({ ...base, isActiveOnDate: false })).toBe(false);
    });
  });

  describe('isEmployeeActiveOnDate', () => {
    const workDate = new Date('2026-06-15');

    it('returns false for terminated', () => {
      expect(isEmployeeActiveOnDate({
        employmentStatus: 'terminated',
        hireDate: new Date('2025-01-01'),
        terminationDate: new Date('2026-06-01'),
        workDate,
      })).toBe(false);
    });

    it('returns true for active employee hired before work date', () => {
      expect(isEmployeeActiveOnDate({
        employmentStatus: 'active',
        hireDate: new Date('2025-01-01'),
        terminationDate: null,
        workDate,
      })).toBe(true);
    });
  });
});
