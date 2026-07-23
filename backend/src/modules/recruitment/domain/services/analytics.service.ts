// ============================================================================
// modules/recruitment/domain/services/analytics.service.ts
// Pure calculations: conversion rates, cost-per-hire, time-to-hire, pipeline
// funnel. All inputs are plain data; no I/O. Results feed the analytics API
// and the reporting module's commission-integration summary.
// ============================================================================

import type { CandidateStage } from './pipeline.service';

export interface FunnelStage {
  stage: CandidateStage;
  count: number;
  conversionRatePct: number | null;   // null for the first stage
}

export interface PipelineFunnel {
  stages: FunnelStage[];
  totalCandidates: number;
  hireRate: number;      // (hired+started+passed_probation) / total * 100
}

export interface CostPerHireBreakdown {
  totalRecruitmentCost: number;
  totalHires: number;
  avgCostPerHire: number;
}

export interface TimeToHireStats {
  avgDays: number;
  minDays: number;
  maxDays: number;
  medianDays: number;
}

export interface RecruiterPerformance {
  recruiterId: string;
  totalCandidates: number;
  uniqueCountedCandidates: number;
  hires: number;
  conversionRatePct: number;
  avgTimeToHireDays: number | null;
}

export interface SourceBreakdown {
  source: string;
  count: number;
  hires: number;
  conversionRatePct: number;
}

export class AnalyticsService {
  /**
   * Build a pipeline funnel from a stage→count map.
   * Stages shown in pipeline order; conversion = count[n] / count[n-1].
   */
  buildFunnel(stageCounts: Record<string, number>): PipelineFunnel {
    const orderedStages: CandidateStage[] = [
      'lead', 'screened', 'interview', 'offer', 'hired', 'started', 'passed_probation',
    ];

    const total = Object.values(stageCounts).reduce((s, c) => s + c, 0);
    const stages: FunnelStage[] = [];
    let prevCount: number | null = null;

    for (const stage of orderedStages) {
      const count = stageCounts[stage] ?? 0;
      if (count === 0 && stages.length === 0) continue; // skip leading zeros
      stages.push({
        stage,
        count,
        conversionRatePct: prevCount != null && prevCount > 0
          ? this.round2((count / prevCount) * 100)
          : null,
      });
      prevCount = count > 0 ? count : prevCount;
    }

    const hiredCount = (stageCounts['hired'] ?? 0)
      + (stageCounts['started'] ?? 0)
      + (stageCounts['passed_probation'] ?? 0);

    return {
      stages,
      totalCandidates: total,
      hireRate: total > 0 ? this.round2((hiredCount / total) * 100) : 0,
    };
  }

  /**
   * Average cost-per-hire: total recruitment cost ÷ number of hires.
   * costPerHireValues = list of cost_per_hire amounts from hired candidates.
   */
  costPerHire(costPerHireValues: number[]): CostPerHireBreakdown {
    const totalHires = costPerHireValues.length;
    const totalCost = this.round2(costPerHireValues.reduce((s, v) => s + v, 0));
    return {
      totalRecruitmentCost: totalCost,
      totalHires,
      avgCostPerHire: totalHires > 0 ? this.round2(totalCost / totalHires) : 0,
    };
  }

  /**
   * Time-to-hire statistics from a list of (createdAt → hiredAt) day spans.
   */
  timeToHire(daySpans: number[]): TimeToHireStats {
    if (daySpans.length === 0) return { avgDays: 0, minDays: 0, maxDays: 0, medianDays: 0 };
    const sorted = [...daySpans].sort((a, b) => a - b);
    const avg = this.round2(sorted.reduce((s, d) => s + d, 0) / sorted.length);
    const mid = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? this.round2((sorted[mid - 1]! + sorted[mid]!) / 2)
      : sorted[mid]!;
    return { avgDays: avg, minDays: sorted[0]!, maxDays: sorted[sorted.length - 1]!, medianDays: median };
  }

  /**
   * Recruiter performance summary from raw candidate rows.
   */
  recruiterPerformance(rows: Array<{
    recruiterId: string;
    isUniqueCounted: boolean;
    stage: CandidateStage;
    daySpan: number | null;
  }>): RecruiterPerformance[] {
    const map = new Map<string, {
      total: number; unique: number; hires: number; spans: number[];
    }>();

    for (const r of rows) {
      const rec = map.get(r.recruiterId) ?? { total: 0, unique: 0, hires: 0, spans: [] };
      rec.total++;
      if (r.isUniqueCounted) rec.unique++;
      if (['hired', 'started', 'passed_probation'].includes(r.stage)) {
        rec.hires++;
        if (r.daySpan != null) rec.spans.push(r.daySpan);
      }
      map.set(r.recruiterId, rec);
    }

    return Array.from(map.entries()).map(([recruiterId, rec]) => ({
      recruiterId,
      totalCandidates: rec.total,
      uniqueCountedCandidates: rec.unique,
      hires: rec.hires,
      conversionRatePct: rec.total > 0 ? this.round2((rec.hires / rec.total) * 100) : 0,
      avgTimeToHireDays: rec.spans.length > 0
        ? this.round2(rec.spans.reduce((s, d) => s + d, 0) / rec.spans.length)
        : null,
    }));
  }

  /**
   * Source breakdown: which referral/channel produced the most hires.
   */
  sourceBreakdown(rows: Array<{ source: string | null; stage: CandidateStage }>): SourceBreakdown[] {
    const map = new Map<string, { count: number; hires: number }>();
    for (const r of rows) {
      const src = r.source ?? 'unknown';
      const rec = map.get(src) ?? { count: 0, hires: 0 };
      rec.count++;
      if (['hired', 'started', 'passed_probation'].includes(r.stage)) rec.hires++;
      map.set(src, rec);
    }
    return Array.from(map.entries())
      .map(([source, rec]) => ({
        source,
        count: rec.count,
        hires: rec.hires,
        conversionRatePct: rec.count > 0 ? this.round2((rec.hires / rec.count) * 100) : 0,
      }))
      .sort((a, b) => b.count - a.count);
  }

  private round2(n: number): number { return Math.round(n * 100) / 100; }
}
