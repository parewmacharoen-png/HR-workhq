// ============================================================================
// modules/recruitment/domain/services/analytics.service.unit.spec.ts
// ============================================================================

import { AnalyticsService } from './analytics.service';
import type { CandidateStage } from './pipeline.service';

describe('AnalyticsService', () => {
  const svc = new AnalyticsService();

  // ── buildFunnel ───────────────────────────────────────────────────────────

  describe('buildFunnel', () => {
    it('builds funnel in pipeline stage order', () => {
      const counts = { lead: 100, interview: 60, offer: 30, hired: 15 };
      const funnel = svc.buildFunnel(counts);
      const stageNames = funnel.stages.map(s => s.stage);
      expect(stageNames.indexOf('lead')).toBeLessThan(stageNames.indexOf('interview'));
      expect(stageNames.indexOf('interview')).toBeLessThan(stageNames.indexOf('offer'));
      expect(stageNames.indexOf('offer')).toBeLessThan(stageNames.indexOf('hired'));
    });

    it('first stage has null conversionRatePct', () => {
      const funnel = svc.buildFunnel({ lead: 100, interview: 50 });
      expect(funnel.stages[0]!.conversionRatePct).toBeNull();
    });

    it('computes conversion rate for second stage', () => {
      const funnel = svc.buildFunnel({ lead: 100, interview: 50 });
      // 50/100 * 100 = 50%
      const interviewStage = funnel.stages.find(s => s.stage === 'interview');
      expect(interviewStage!.conversionRatePct).toBe(50);
    });

    it('computes correct conversion through the full pipeline', () => {
      const counts = { lead: 200, screened: 100, interview: 60, offer: 30, hired: 15 };
      const funnel = svc.buildFunnel(counts);

      const screened  = funnel.stages.find(s => s.stage === 'screened');
      const interview = funnel.stages.find(s => s.stage === 'interview');
      const offer     = funnel.stages.find(s => s.stage === 'offer');
      const hired     = funnel.stages.find(s => s.stage === 'hired');

      expect(screened!.conversionRatePct).toBe(50);   // 100/200
      expect(interview!.conversionRatePct).toBe(60);  // 60/100
      expect(offer!.conversionRatePct).toBe(50);      // 30/60
      expect(hired!.conversionRatePct).toBe(50);      // 15/30
    });

    it('computes totalCandidates as sum of all counts', () => {
      const counts = { lead: 100, interview: 50, offer: 20, hired: 10 };
      const funnel = svc.buildFunnel(counts);
      expect(funnel.totalCandidates).toBe(180);
    });

    it('computes hireRate = (hired+started+passed_probation)/total * 100', () => {
      const counts = { lead: 100, hired: 10, started: 5, passed_probation: 5 };
      const funnel = svc.buildFunnel(counts);
      // 20/120 * 100 = 16.67
      expect(funnel.hireRate).toBe(16.67);
    });

    it('hireRate is 0 when total is 0', () => {
      const funnel = svc.buildFunnel({});
      expect(funnel.hireRate).toBe(0);
    });

    it('hireRate is 100 when all candidates are hired', () => {
      const funnel = svc.buildFunnel({ hired: 10 });
      expect(funnel.hireRate).toBe(100);
    });

    it('skips leading zero-count stages', () => {
      // No leads — funnel should start at interview
      const counts = { interview: 50, offer: 25 };
      const funnel = svc.buildFunnel(counts);
      expect(funnel.stages[0]!.stage).toBe('interview');
    });

    it('includes a stage with 0 count once funnel has started', () => {
      // lead=50, screened=0, interview=30 — screened should appear as 0
      const counts = { lead: 50, screened: 0, interview: 30 };
      const funnel = svc.buildFunnel(counts);
      const screened = funnel.stages.find(s => s.stage === 'screened');
      expect(screened).toBeDefined();
      expect(screened!.count).toBe(0);
    });

    it('handles empty counts object', () => {
      const funnel = svc.buildFunnel({});
      expect(funnel.stages).toHaveLength(0);
      expect(funnel.totalCandidates).toBe(0);
    });

    it('rounds conversion rates to 2 decimal places', () => {
      // 1/3 * 100 = 33.333...
      const counts = { lead: 3, interview: 1 };
      const funnel = svc.buildFunnel(counts);
      const interview = funnel.stages.find(s => s.stage === 'interview');
      expect(interview!.conversionRatePct).toBe(33.33);
    });

    it('uses prevCount to bridge over zero-count stages for conversion', () => {
      // lead=100, screened=0, interview=50
      // interview conversion should be 50/100=50%, not 50/0
      const counts = { lead: 100, screened: 0, interview: 50 };
      const funnel = svc.buildFunnel(counts);
      const interview = funnel.stages.find(s => s.stage === 'interview');
      expect(interview!.conversionRatePct).toBe(50);
    });
  });

  // ── costPerHire ───────────────────────────────────────────────────────────

  describe('costPerHire', () => {
    it('computes average from a list of values', () => {
      const result = svc.costPerHire([5000, 7000, 6000]);
      expect(result.totalHires).toBe(3);
      expect(result.totalRecruitmentCost).toBe(18000);
      expect(result.avgCostPerHire).toBe(6000);
    });

    it('returns zeros for empty input', () => {
      const result = svc.costPerHire([]);
      expect(result.totalHires).toBe(0);
      expect(result.totalRecruitmentCost).toBe(0);
      expect(result.avgCostPerHire).toBe(0);
    });

    it('works for a single hire', () => {
      const result = svc.costPerHire([10000]);
      expect(result.totalHires).toBe(1);
      expect(result.avgCostPerHire).toBe(10000);
    });

    it('rounds totalCost and average to 2 decimal places', () => {
      const result = svc.costPerHire([1000, 2000, 3000]);
      expect(result.totalRecruitmentCost).toBe(6000);
      // Even for non-divisible sums it should round
      const result2 = svc.costPerHire([100, 200, 99.999]);
      expect(Number.isFinite(result2.avgCostPerHire)).toBe(true);
      const parts = result2.avgCostPerHire.toString().split('.');
      expect((parts[1] ?? '').length).toBeLessThanOrEqual(2);
    });

    it('handles fractional values', () => {
      const result = svc.costPerHire([999.99, 1000.01]);
      expect(result.totalRecruitmentCost).toBe(2000);
    });

    it('avgCostPerHire is 0 when totalHires is 0', () => {
      expect(svc.costPerHire([]).avgCostPerHire).toBe(0);
    });
  });

  // ── timeToHire ────────────────────────────────────────────────────────────

  describe('timeToHire', () => {
    it('returns zeros for empty input', () => {
      const result = svc.timeToHire([]);
      expect(result).toEqual({ avgDays: 0, minDays: 0, maxDays: 0, medianDays: 0 });
    });

    it('returns correct stats for a single value', () => {
      const result = svc.timeToHire([30]);
      expect(result.avgDays).toBe(30);
      expect(result.minDays).toBe(30);
      expect(result.maxDays).toBe(30);
      expect(result.medianDays).toBe(30);
    });

    it('computes min, max, avg, median for odd-count input', () => {
      const result = svc.timeToHire([10, 20, 30, 40, 50]);
      expect(result.minDays).toBe(10);
      expect(result.maxDays).toBe(50);
      expect(result.avgDays).toBe(30);
      expect(result.medianDays).toBe(30); // middle value
    });

    it('computes median as average of two middle values for even-count input', () => {
      const result = svc.timeToHire([10, 20, 30, 40]);
      expect(result.medianDays).toBe(25); // (20+30)/2
    });

    it('sorts input before computing stats (handles unsorted input)', () => {
      const result = svc.timeToHire([50, 10, 30, 20, 40]);
      expect(result.minDays).toBe(10);
      expect(result.maxDays).toBe(50);
      expect(result.medianDays).toBe(30);
    });

    it('does not mutate the input array', () => {
      const input = [50, 10, 30];
      svc.timeToHire(input);
      expect(input).toEqual([50, 10, 30]);
    });

    it('rounds average to 2 decimal places', () => {
      // 10 + 20 + 30 = 60/3 = 20 — exact
      expect(svc.timeToHire([10, 20, 30]).avgDays).toBe(20);
      // 1 + 2 = 3/2 = 1.5 — exact
      expect(svc.timeToHire([1, 2]).avgDays).toBe(1.5);
      // 1 + 2 + 3 + 4 = 10/4 = 2.5 — exact
      expect(svc.timeToHire([1, 2, 3, 4]).avgDays).toBe(2.5);
    });

    it('handles all-identical values', () => {
      const result = svc.timeToHire([15, 15, 15, 15]);
      expect(result.minDays).toBe(15);
      expect(result.maxDays).toBe(15);
      expect(result.avgDays).toBe(15);
      expect(result.medianDays).toBe(15);
    });
  });

  // ── recruiterPerformance ──────────────────────────────────────────────────

  describe('recruiterPerformance', () => {
    it('groups rows by recruiterId', () => {
      const rows = [
        { recruiterId: 'r1', isUniqueCounted: true,  stage: 'hired' as CandidateStage, daySpan: 30 },
        { recruiterId: 'r1', isUniqueCounted: true,  stage: 'interview' as CandidateStage, daySpan: null },
        { recruiterId: 'r2', isUniqueCounted: false, stage: 'hired' as CandidateStage, daySpan: 45 },
      ];
      const results = svc.recruiterPerformance(rows);
      expect(results).toHaveLength(2);
    });

    it('counts total candidates per recruiter', () => {
      const rows = [
        { recruiterId: 'r1', isUniqueCounted: true,  stage: 'lead' as CandidateStage, daySpan: null },
        { recruiterId: 'r1', isUniqueCounted: false, stage: 'rejected' as CandidateStage, daySpan: null },
        { recruiterId: 'r1', isUniqueCounted: true,  stage: 'hired' as CandidateStage, daySpan: 20 },
      ];
      const [r1] = svc.recruiterPerformance(rows);
      expect(r1!.totalCandidates).toBe(3);
    });

    it('counts uniqueCountedCandidates', () => {
      const rows = [
        { recruiterId: 'r1', isUniqueCounted: true,  stage: 'lead' as CandidateStage, daySpan: null },
        { recruiterId: 'r1', isUniqueCounted: false, stage: 'lead' as CandidateStage, daySpan: null },
        { recruiterId: 'r1', isUniqueCounted: true,  stage: 'hired' as CandidateStage, daySpan: 20 },
      ];
      const [r1] = svc.recruiterPerformance(rows);
      expect(r1!.uniqueCountedCandidates).toBe(2);
    });

    it('counts hires for hired, started, passed_probation stages only', () => {
      const rows: Array<{ recruiterId: string; isUniqueCounted: boolean; stage: CandidateStage; daySpan: number | null }> = [
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'hired',            daySpan: 30 },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'started',          daySpan: 40 },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'passed_probation', daySpan: 50 },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'offer',            daySpan: null }, // not a hire
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'rejected',         daySpan: null }, // not a hire
      ];
      const [r1] = svc.recruiterPerformance(rows);
      expect(r1!.hires).toBe(3);
    });

    it('computes conversionRatePct = hires/total * 100', () => {
      const rows = [
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'hired' as CandidateStage, daySpan: 30 },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'rejected' as CandidateStage, daySpan: null },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'rejected' as CandidateStage, daySpan: null },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'rejected' as CandidateStage, daySpan: null },
      ];
      const [r1] = svc.recruiterPerformance(rows);
      expect(r1!.conversionRatePct).toBe(25); // 1/4 * 100
    });

    it('computes avgTimeToHireDays from daySpan of hire-stage rows only', () => {
      const rows: Array<{ recruiterId: string; isUniqueCounted: boolean; stage: CandidateStage; daySpan: number | null }> = [
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'hired',    daySpan: 20 },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'started',  daySpan: 40 },
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'offer',    daySpan: 5 }, // offer, not counted
      ];
      const [r1] = svc.recruiterPerformance(rows);
      expect(r1!.avgTimeToHireDays).toBe(30); // (20+40)/2
    });

    it('avgTimeToHireDays is null when no day spans are available', () => {
      const rows = [
        { recruiterId: 'r1', isUniqueCounted: true, stage: 'hired' as CandidateStage, daySpan: null },
      ];
      const [r1] = svc.recruiterPerformance(rows);
      expect(r1!.avgTimeToHireDays).toBeNull();
    });

    it('returns empty array for empty input', () => {
      expect(svc.recruiterPerformance([])).toHaveLength(0);
    });

    it('conversionRatePct is 0 when total > 0 but no hires', () => {
      const rows = [
        { recruiterId: 'r1', isUniqueCounted: false, stage: 'rejected' as CandidateStage, daySpan: null },
      ];
      const [r1] = svc.recruiterPerformance(rows);
      expect(r1!.conversionRatePct).toBe(0);
    });
  });

  // ── sourceBreakdown ───────────────────────────────────────────────────────

  describe('sourceBreakdown', () => {
    it('groups rows by source', () => {
      const rows = [
        { source: 'referral', stage: 'hired' as CandidateStage },
        { source: 'referral', stage: 'hired' as CandidateStage },
        { source: 'linkedin', stage: 'rejected' as CandidateStage },
      ];
      const result = svc.sourceBreakdown(rows);
      expect(result).toHaveLength(2);
    });

    it('maps null source to "unknown"', () => {
      const rows = [{ source: null, stage: 'hired' as CandidateStage }];
      const result = svc.sourceBreakdown(rows);
      expect(result[0]!.source).toBe('unknown');
    });

    it('counts hires for hired, started, passed_probation', () => {
      const rows: Array<{ source: string | null; stage: CandidateStage }> = [
        { source: 'referral', stage: 'hired' },
        { source: 'referral', stage: 'started' },
        { source: 'referral', stage: 'passed_probation' },
        { source: 'referral', stage: 'rejected' },
        { source: 'referral', stage: 'offer' },
      ];
      const result = svc.sourceBreakdown(rows);
      expect(result[0]!.hires).toBe(3);
      expect(result[0]!.count).toBe(5);
    });

    it('computes conversionRatePct = hires/count * 100', () => {
      const rows = [
        { source: 'referral', stage: 'hired' as CandidateStage },
        { source: 'referral', stage: 'rejected' as CandidateStage },
        { source: 'referral', stage: 'rejected' as CandidateStage },
        { source: 'referral', stage: 'rejected' as CandidateStage },
      ];
      const result = svc.sourceBreakdown(rows);
      expect(result[0]!.conversionRatePct).toBe(25);
    });

    it('sorts result descending by count', () => {
      const rows = [
        { source: 'linkedin', stage: 'rejected' as CandidateStage },
        { source: 'referral', stage: 'hired' as CandidateStage },
        { source: 'referral', stage: 'hired' as CandidateStage },
        { source: 'referral', stage: 'rejected' as CandidateStage },
      ];
      const result = svc.sourceBreakdown(rows);
      // referral has 3, linkedin has 1
      expect(result[0]!.source).toBe('referral');
      expect(result[1]!.source).toBe('linkedin');
    });

    it('returns empty array for empty input', () => {
      expect(svc.sourceBreakdown([])).toHaveLength(0);
    });

    it('conversionRatePct is 0 when no hires for a source', () => {
      const rows = [
        { source: 'cold-call', stage: 'rejected' as CandidateStage },
        { source: 'cold-call', stage: 'interview' as CandidateStage },
      ];
      const result = svc.sourceBreakdown(rows);
      expect(result[0]!.conversionRatePct).toBe(0);
    });

    it('conversionRatePct rounds to 2 decimal places', () => {
      const rows = [
        { source: 'referral', stage: 'hired' as CandidateStage },
        { source: 'referral', stage: 'rejected' as CandidateStage },
        { source: 'referral', stage: 'rejected' as CandidateStage },
      ];
      const result = svc.sourceBreakdown(rows);
      expect(result[0]!.conversionRatePct).toBe(33.33); // 1/3 * 100
    });
  });
});
