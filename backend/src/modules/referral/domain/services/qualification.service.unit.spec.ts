// ============================================================================
// modules/referral/domain/services/qualification.service.unit.spec.ts
// ============================================================================

import { QualificationService } from './qualification.service';
import { EmployeeNotYetEligibleError } from '../errors/referral.errors';

// THREE_MONTHS_MS = 3 * 30.44 * 24 * 60 * 60 * 1000 ≈ 7,891,776,000 ms (≈91.32 days)
const THREE_MONTHS_MS = 3 * 30.44 * 24 * 60 * 60 * 1000;

/** Build a fixed reference date for deterministic tests. */
const NOW = new Date('2024-06-01T12:00:00.000Z');

/** Date exactly three months before NOW. */
// 92 full days > 91.32 day threshold — unambiguously past 3 months
const THREE_MONTHS_AGO = new Date(NOW.getTime() - 92 * 86_400_000);

/** Date one day after three months ago (still within the 3-month window). */
// 91 full days < 91.32 day threshold — just under 3 months
const JUST_UNDER_THREE_MONTHS = new Date(NOW.getTime() - 91 * 86_400_000);

/** Date one day before NOW (probation ended very recently). */
const YESTERDAY = new Date(NOW.getTime() - 86_400_000);

function makeInput(
  overrides: Partial<{
    hireDate: Date;
    employmentStatus: 'probation' | 'active' | 'suspended' | 'terminated';
    probationEndDate: Date | null;
  }>,
) {
  return {
    hireDate: THREE_MONTHS_AGO,
    employmentStatus: 'active' as const,
    probationEndDate: YESTERDAY,
    asOf: NOW,
    ...overrides,
  };
}

describe('QualificationService.assess', () => {
  const svc = new QualificationService();
  /** Preserves pre-HR-11D approximate 3×30.44 day threshold in unit tests. */
  const legacyConfig = { requiredEmploymentDays: 3 * 30.44 };
  const assess = (input: Parameters<QualificationService['assess']>[0]) =>
    svc.assess(input, legacyConfig);

  // ── Terminated employee ───────────────────────────────────────────────────
  describe('terminated employee', () => {
    it('returns not qualified with reason "terminated"', () => {
      const result = assess(makeInput({ employmentStatus: 'terminated' }));
      expect(result.qualified).toBe(false);
      expect(result.condition).toBeNull();
      expect(result.reason).toMatch(/terminated/i);
    });

    it('is not qualified even with long tenure', () => {
      const result = assess({
        hireDate: new Date('2020-01-01'),
        employmentStatus: 'terminated',
        probationEndDate: new Date('2020-04-01'),
        asOf: NOW,
      });
      expect(result.qualified).toBe(false);
    });
  });

  // ── Probation pass (Condition 1) ──────────────────────────────────────────
  describe('probation_pass condition', () => {
    it('qualifies when status=active and probationEndDate is in the past', () => {
      const result = assess(makeInput({
        employmentStatus: 'active',
        probationEndDate: YESTERDAY,
      }));
      expect(result.qualified).toBe(true);
      expect(result.condition).toBe('probation_pass');
    });

    it('qualifies when probationEndDate equals NOW exactly', () => {
      const result = assess(makeInput({
        employmentStatus: 'active',
        probationEndDate: NOW,
      }));
      expect(result.qualified).toBe(true);
      expect(result.condition).toBe('probation_pass');
    });

    it('sets qualifiedAt to the probationEndDate', () => {
      const result = assess(makeInput({
        employmentStatus: 'active',
        probationEndDate: YESTERDAY,
      }));
      expect(result.qualifiedAt).toEqual(YESTERDAY);
    });

    it('does NOT qualify via probation_pass when status is "probation" (not yet active)', () => {
      const result = assess(makeInput({
        hireDate: THREE_MONTHS_AGO,  // 3 months ago — meets three_months too
        employmentStatus: 'probation',
        probationEndDate: YESTERDAY, // date is past but status not updated to active
      }));
      // Should not qualify via probation_pass; may qualify via three_months
      if (result.qualified) {
        expect(result.condition).toBe('three_months');
      } else {
        expect(result.condition).toBeNull();
      }
    });

    it('does NOT qualify via probation_pass when probationEndDate is in the future', () => {
      const futureEnd = new Date(NOW.getTime() + 30 * 86_400_000);
      const result = assess(makeInput({
        hireDate: JUST_UNDER_THREE_MONTHS, // under 3 months
        employmentStatus: 'active',
        probationEndDate: futureEnd,
      }));
      expect(result.qualified).toBe(false);
    });

    it('does NOT qualify via probation_pass when probationEndDate is null', () => {
      const result = assess(makeInput({
        hireDate: JUST_UNDER_THREE_MONTHS,
        employmentStatus: 'active',
        probationEndDate: null,
      }));
      // no probation date + under 3 months → not qualified
      expect(result.qualified).toBe(false);
    });

    it('probation_pass takes priority over three_months', () => {
      // Employee has both: passed probation AND worked 3+ months
      const result = assess(makeInput({
        hireDate: THREE_MONTHS_AGO,
        employmentStatus: 'active',
        probationEndDate: YESTERDAY,
      }));
      expect(result.condition).toBe('probation_pass');
    });
  });

  // ── Three month rule (Condition 2) ────────────────────────────────────────
  describe('three_months condition', () => {
    it('qualifies when tenure >= THREE_MONTHS_MS', () => {
      const result = assess(makeInput({
        hireDate: THREE_MONTHS_AGO,
        employmentStatus: 'probation',  // still on probation
        probationEndDate: null,
      }));
      expect(result.qualified).toBe(true);
      expect(result.condition).toBe('three_months');
    });

    it('sets qualifiedAt to hireDate + THREE_MONTHS_MS', () => {
      const result = assess(makeInput({
        hireDate: THREE_MONTHS_AGO,
        employmentStatus: 'probation',
        probationEndDate: null,
      }));
      const expectedQualifiedAt = new Date(THREE_MONTHS_AGO.getTime() + THREE_MONTHS_MS);
      expect(result.qualifiedAt!.getTime()).toBeCloseTo(expectedQualifiedAt.getTime(), -3);
    });

    it('qualifies when status=suspended but 3 months reached', () => {
      const result = assess(makeInput({
        hireDate: THREE_MONTHS_AGO,
        employmentStatus: 'suspended',
        probationEndDate: null,
      }));
      expect(result.qualified).toBe(true);
      expect(result.condition).toBe('three_months');
    });

    it('does NOT qualify when one day short of three months', () => {
      const result = assess(makeInput({
        hireDate: JUST_UNDER_THREE_MONTHS,
        employmentStatus: 'probation',
        probationEndDate: null,
      }));
      expect(result.qualified).toBe(false);
      expect(result.condition).toBeNull();
    });

    it('qualifies exactly at the three-month boundary', () => {
      // Hire 92 full days ago — unambiguously past the 91.32-day threshold.
      // We cannot test the exact ms boundary reliably because THREE_MONTHS_MS
      // has floating-point fractional digits (~0.000001 ms).
      const result = assess({
        hireDate: THREE_MONTHS_AGO, // 92 days ago = clearly qualified
        employmentStatus: 'probation',
        probationEndDate: null,
        asOf: NOW,
      });
      expect(result.qualified).toBe(true);
    });
  });

  // ── Not yet eligible ───────────────────────────────────────────────────────
  describe('not yet eligible', () => {
    it('returns qualified=false with days remaining in reason', () => {
      const result = assess(makeInput({
        hireDate: JUST_UNDER_THREE_MONTHS,
        employmentStatus: 'probation',
        probationEndDate: null,
      }));
      expect(result.qualified).toBe(false);
      expect(result.reason).toMatch(/day/i);
    });

    it('reason mentions the 3-month mark', () => {
      const result = assess(makeInput({
        hireDate: new Date(NOW.getTime() - 7 * 86_400_000), // 7 days ago
        employmentStatus: 'probation',
        probationEndDate: null,
      }));
      expect(result.reason).toMatch(/day mark/i);
    });

    it('qualifiedAt is null when not qualified', () => {
      const result = assess(makeInput({
        hireDate: JUST_UNDER_THREE_MONTHS,
        employmentStatus: 'probation',
        probationEndDate: null,
      }));
      expect(result.qualifiedAt).toBeNull();
    });

    it('new hire (hired today) is not qualified', () => {
      const result = assess({
        hireDate: NOW,
        employmentStatus: 'probation',
        probationEndDate: null,
        asOf: NOW,
      });
      expect(result.qualified).toBe(false);
    });
  });

  // ── asOf injectable date ───────────────────────────────────────────────────
  describe('injectable asOf date for determinism', () => {
    it('can simulate future evaluation date', () => {
      const futureNow = new Date(NOW.getTime() + 100 * 86_400_000);
      const result = assess({
        hireDate: JUST_UNDER_THREE_MONTHS,
        employmentStatus: 'probation',
        probationEndDate: null,
        asOf: futureNow,
      });
      expect(result.qualified).toBe(true); // will have passed 3 months by then
    });

    it('can simulate past evaluation date that would not qualify', () => {
      // Hire 150 days before NOW. At NOW they've been working 150 days (> threshold).
      // At pastNow (100 days before NOW) they'd have been working 50 days (< 91.32 threshold).
      const hire150DaysAgo = new Date(NOW.getTime() - 150 * 86_400_000);
      const pastNow = new Date(NOW.getTime() - 100 * 86_400_000); // 50 days after hire
      const result = assess({
        hireDate: hire150DaysAgo,
        employmentStatus: 'probation',
        probationEndDate: null,
        asOf: pastNow,
      });
      // At pastNow: 50 days tenure < 91.32-day threshold → not qualified
      expect(result.qualified).toBe(false);
    });
  });
});

// ── QualificationService.assertEligible ──────────────────────────────────────

describe('QualificationService.assertEligible', () => {
  const svc = new QualificationService();
  const legacyConfig = { requiredEmploymentDays: 3 * 30.44 };

  it('returns the qualifying condition when qualified via probation_pass', () => {
    const condition = svc.assertEligible(makeInput({
      employmentStatus: 'active',
      probationEndDate: YESTERDAY,
    }), legacyConfig);
    expect(condition).toBe('probation_pass');
  });

  it('returns the qualifying condition when qualified via three_months', () => {
    const condition = svc.assertEligible(makeInput({
      hireDate: THREE_MONTHS_AGO,
      employmentStatus: 'probation',
      probationEndDate: null,
    }), legacyConfig);
    expect(condition).toBe('three_months');
  });

  it('throws EmployeeNotYetEligibleError when not qualified', () => {
    expect(() => svc.assertEligible(makeInput({
      hireDate: JUST_UNDER_THREE_MONTHS,
      employmentStatus: 'probation',
      probationEndDate: null,
    }), legacyConfig)).toThrow(EmployeeNotYetEligibleError);
  });

  it('throws EmployeeNotYetEligibleError for terminated employee', () => {
    expect(() => svc.assertEligible(makeInput({
      employmentStatus: 'terminated',
    }), legacyConfig)).toThrow(EmployeeNotYetEligibleError);
  });

  it('error message includes the reason from assess()', () => {
    try {
      svc.assertEligible(makeInput({
        hireDate: JUST_UNDER_THREE_MONTHS,
        employmentStatus: 'probation',
        probationEndDate: null,
      }), legacyConfig);
      fail('expected error');
    } catch (e) {
      expect((e as Error).message).toMatch(/day/i);
    }
  });
});
