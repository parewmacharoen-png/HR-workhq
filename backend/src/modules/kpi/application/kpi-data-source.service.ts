// ============================================================================
// modules/kpi/application/kpi-data-source.service.ts
// KPI-002 — resolve metric scores from manual/formula/system/api sources
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';

export interface MetricScoreContext {
  employeeId: string;
  companyId: string;
  assignmentId?: string;
  periodStart?: Date;
  periodEnd?: Date;
  target?: number;
  actual?: number;
}

export interface MetricForScoring {
  scoringMethod: string;
  targetValue?: string | null;
  formulaExpression?: string | null;
  systemSourceKey?: string | null;
  apiEndpoint?: string | null;
  apiFieldPath?: string | null;
}

export interface MetricScoreResult {
  score: number | null;
  rawValue?: string | null;
  note?: string;
}

@Injectable()
export class KpiDataSourceService {
  constructor(private readonly prisma: PrismaService) {}

  normalizeScoringMethod(method: string): 'manual' | 'formula' | 'system' | 'api' {
    if (method === 'imported') return 'system';
    if (method === 'formula' || method === 'system' || method === 'api') return method;
    return 'manual';
  }

  async resolveMetricScore(
    metric: MetricForScoring,
    context: MetricScoreContext,
  ): Promise<MetricScoreResult> {
    const method = this.normalizeScoringMethod(metric.scoringMethod);

    switch (method) {
      case 'manual':
        return { score: null, note: 'Manual scoring required' };
      case 'formula':
        return this.resolveFormulaScore(metric, context);
      case 'system':
        return this.resolveSystemScore(metric, context);
      case 'api':
        return {
          score: null,
          note: 'API scoring is not yet implemented',
        };
      default:
        return { score: null };
    }
  }

  private resolveFormulaScore(
    metric: MetricForScoring,
    context: MetricScoreContext,
  ): MetricScoreResult {
    const expression = metric.formulaExpression?.trim();
    if (!expression) {
      return { score: null, note: 'Formula expression is missing' };
    }

    const target = context.target ?? parseNumber(metric.targetValue);
    const actual = context.actual ?? target;

    const substituted = expression
      .replace(/\{target\}/gi, String(target ?? 0))
      .replace(/\{actual\}/gi, String(actual ?? 0));

    const score = safeEvalNumericExpression(substituted);
    if (score == null) {
      return { score: null, rawValue: substituted, note: 'Formula could not be evaluated' };
    }

    return { score, rawValue: substituted };
  }

  private async resolveSystemScore(
    metric: MetricForScoring,
    context: MetricScoreContext,
  ): Promise<MetricScoreResult> {
    const key = metric.systemSourceKey?.trim();
    if (!key) {
      return { score: null, note: 'System source key is missing' };
    }

    switch (key) {
      case 'attendance.present_days':
        return this.resolvePresentDays(context);
      case 'kpi.prior_score':
        return this.resolvePriorKpiScore(context);
      default:
        return { score: null, note: `Unknown system source key: ${key}` };
    }
  }

  private async resolvePresentDays(context: MetricScoreContext): Promise<MetricScoreResult> {
    const where: Prisma.AttendanceRecordWhereInput = {
      employeeId: context.employeeId,
      companyId: context.companyId,
      deletedAt: null,
      status: { in: ['present', 'corrected'] },
    };

    if (context.periodStart || context.periodEnd) {
      where.workDate = {};
      if (context.periodStart) where.workDate.gte = context.periodStart;
      if (context.periodEnd) where.workDate.lte = context.periodEnd;
    }

    const count = await this.prisma.attendanceRecord.count({ where });
    return { score: count, rawValue: String(count) };
  }

  private async resolvePriorKpiScore(context: MetricScoreContext): Promise<MetricScoreResult> {
    const prior = await this.prisma.kpiAssignment.findFirst({
      where: {
        employeeId: context.employeeId,
        deletedAt: null,
        status: 'finalized',
        ...(context.assignmentId ? { id: { not: context.assignmentId } } : {}),
        cycle: { companyId: context.companyId, deletedAt: null },
        score: { totalScore: { not: null } },
      },
      include: { score: true },
      orderBy: { updatedAt: 'desc' },
    });

    if (!prior?.score?.totalScore) {
      return { score: null, rawValue: null, note: 'No prior finalized KPI score found' };
    }

    const score = Number(prior.score.totalScore);
    return { score, rawValue: String(score) };
  }
}

function parseNumber(value: string | null | undefined): number | undefined {
  if (value == null || value === '') return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function safeEvalNumericExpression(expression: string): number | null {
  const sanitized = expression.replace(/\s+/g, '');
  if (!sanitized || !/^[\d.+\-*/()]+$/.test(sanitized)) {
    return null;
  }

  try {
    // eslint-disable-next-line no-new-func
    const result = Function(`"use strict"; return (${sanitized});`)();
    if (typeof result !== 'number' || !Number.isFinite(result)) return null;
    return Math.round(result * 100) / 100;
  } catch {
    return null;
  }
}
