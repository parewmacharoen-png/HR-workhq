// ============================================================================
// modules/performance/infrastructure/persistence/performance.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { EvaluationEntity } from '../../domain/entities/evaluation.entity';
import { ProbationReview } from '../../domain/entities/probation-review.entity';
import type { Grade, PromotionReadiness, SalaryReviewAction, DimensionWeight, PerformanceDimension, ScoredDimension } from '../../domain/services/scoring.service';
import {
  PerformanceCycleRepository, EvaluationRepository, EvaluationScoreRepository,
  EvaluationWeightRepository, ProbationReviewRepository,
  FormulaVersionRepository, EmployeeContextRepository, EmployeeStatusRepository,
  CycleRow, CycleStatus, ScoreRow, EmployeeContext,
} from '../../domain/repositories/performance.repository';

// ── Cycle ─────────────────────────────────────────────────────────────────────
@Injectable()
export class PrismaPerformanceCycleRepository implements PerformanceCycleRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<CycleRow | null> {
    const row = await this.prisma.performanceCycle.findFirst({ where: { id, deletedAt: null } });
    return row ? { id: row.id, companyId: row.companyId, periodStart: row.periodStart, periodEnd: row.periodEnd, status: row.status as CycleStatus } : null;
  }
  async findOpenForCompany(companyId: string): Promise<CycleRow | null> {
    const row = await this.prisma.performanceCycle.findFirst({ where: { companyId, status: 'open', deletedAt: null }, orderBy: { periodStart: 'desc' } });
    return row ? { id: row.id, companyId: row.companyId, periodStart: row.periodStart, periodEnd: row.periodEnd, status: row.status as CycleStatus } : null;
  }
  async listByCompany(companyId: string): Promise<CycleRow[]> {
    const rows = await this.prisma.performanceCycle.findMany({ where: { companyId, deletedAt: null }, orderBy: { periodStart: 'desc' } });
    return rows.map(r => ({ id: r.id, companyId: r.companyId, periodStart: r.periodStart, periodEnd: r.periodEnd, status: r.status as CycleStatus }));
  }
  async create(input: { id: string; companyId: string | null; periodStart: Date; periodEnd: Date; actorUserId: string }): Promise<void> {
    await this.prisma.performanceCycle.create({
      data: {
        id: input.id,
        companyId: input.companyId ?? undefined,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        status: 'open',
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
  }
  async updateStatus(id: string, status: CycleStatus, actorUserId: string): Promise<void> {
    await this.prisma.performanceCycle.update({ where: { id }, data: { status, updatedBy: actorUserId } });
  }
}

// ── Evaluation ─────────────────────────────────────────────────────────────────
@Injectable()
export class PrismaEvaluationRepository implements EvaluationRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<EvaluationEntity | null> {
    const row = await this.prisma.evaluation.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findByCycleAndEmployee(cycleId: string, employeeId: string): Promise<EvaluationEntity | null> {
    const row = await this.prisma.evaluation.findFirst({ where: { performanceCycleId: cycleId, employeeId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findByEmployee(employeeId: string, limit = 24): Promise<EvaluationEntity[]> {
    const rows = await this.prisma.evaluation.findMany({ where: { employeeId, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: limit });
    return rows.map(r => this.toDomain(r));
  }
  async findByCycle(cycleId: string): Promise<EvaluationEntity[]> {
    const rows = await this.prisma.evaluation.findMany({ where: { performanceCycleId: cycleId, deletedAt: null } });
    return rows.map(r => this.toDomain(r));
  }
  async findByWorkflowEntity(entityId: string): Promise<EvaluationEntity | null> {
    // The workflow entity_id IS the evaluation.id for performance_review workflows
    const row = await this.prisma.evaluation.findFirst({ where: { id: entityId, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async save(evaluation: EvaluationEntity, actorUserId: string): Promise<void> {
    const p = evaluation.toPersistence();
    await this.prisma.evaluation.upsert({
      where: { id: p.id },
      create: {
        id: p.id, performanceCycleId: p.performanceCycleId,
        employeeId: p.employeeId, companyId: p.companyId,
        totalScore: new Prisma.Decimal(p.totalScore), status: p.status,
        aiRecommendationId: p.aiRecommendationId ?? undefined,
        finalizedBy: p.finalizedBy ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
        // Extended columns
        ...(p.grade && { grade: p.grade }),
        ...(p.promotionReadiness && { promotionReadiness: p.promotionReadiness }),
        ...(p.salaryReviewRecommendation && { salaryReviewRecommendation: p.salaryReviewRecommendation }),
        ...(p.salaryIncreasePct != null && { salaryIncreasePct: new Prisma.Decimal(p.salaryIncreasePct) }),
        ...(p.promotionNotes && { promotionNotes: p.promotionNotes }),
        ...(p.workflowInstanceId && { workflowInstanceId: p.workflowInstanceId }),
        ...(p.formulaVersionId && { formulaVersionId: p.formulaVersionId }),
      },
      update: {
        totalScore: new Prisma.Decimal(p.totalScore), status: p.status,
        finalizedBy: p.finalizedBy ?? undefined,
        updatedBy: actorUserId,
        ...(p.grade && { grade: p.grade }),
        ...(p.promotionReadiness && { promotionReadiness: p.promotionReadiness }),
        ...(p.salaryReviewRecommendation && { salaryReviewRecommendation: p.salaryReviewRecommendation }),
        ...(p.salaryIncreasePct != null && { salaryIncreasePct: new Prisma.Decimal(p.salaryIncreasePct) }),
        ...(p.promotionNotes && { promotionNotes: p.promotionNotes }),
        ...(p.workflowInstanceId && { workflowInstanceId: p.workflowInstanceId }),
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.evaluation.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId } });
  }
  private toDomain(r: any): EvaluationEntity {
    return EvaluationEntity.rehydrate({
      id: r.id, performanceCycleId: r.performanceCycleId,
      employeeId: r.employeeId, companyId: r.companyId,
      totalScore: Number(r.totalScore), status: r.status,
      // EXTENDED COLUMNS — added by migration 20260101000400_performance_extensions.
      // These casts resolve to proper types after `prisma generate` runs.
      grade: (r as any).grade ?? null,
      promotionReadiness: (r as any).promotionReadiness ?? null,
      salaryReviewRecommendation: (r as any).salaryReviewRecommendation ?? null,
      salaryIncreasePct: (r as any).salaryIncreasePct != null ? Number((r as any).salaryIncreasePct) : null,
      promotionNotes: (r as any).promotionNotes ?? null,
      workflowInstanceId: (r as any).workflowInstanceId ?? null,
      formulaVersionId: (r as any).formulaVersionId ?? null,
      aiRecommendationId: r.aiRecommendationId ?? null,
      finalizedBy: r.finalizedBy ?? null,
      deletedAt: r.deletedAt,
    });
  }
}

// ── Evaluation Scores ─────────────────────────────────────────────────────────
@Injectable()
export class PrismaEvaluationScoreRepository implements EvaluationScoreRepository {
  constructor(private readonly prisma: PrismaService) {}

  async upsertScores(
    evaluationId: string,
    scores: ScoredDimension[],
    scoredBy: 'system' | 'manager' | 'owner' | 'ai',
    actorUserId: string,
  ): Promise<void> {
    for (const s of scores) {
      await this.prisma.evaluationScore.upsert({
        where: { evaluationId_dimension_scoredBy: { evaluationId, dimension: s.dimension, scoredBy } },
        create: {
          id: randomUUID(), evaluationId, dimension: s.dimension,
          rawScore: new Prisma.Decimal(s.rawScore),
          weightApplied: new Prisma.Decimal(s.weight),
          weightedScore: new Prisma.Decimal(s.weightedScore),
          scoredBy,
          createdBy: actorUserId, updatedBy: actorUserId,
        },
        update: {
          rawScore: new Prisma.Decimal(s.rawScore),
          weightApplied: new Prisma.Decimal(s.weight),
          weightedScore: new Prisma.Decimal(s.weightedScore),
          updatedBy: actorUserId,
        },
      });
    }
  }

  async listByEvaluation(evaluationId: string): Promise<ScoreRow[]> {
    const rows = await this.prisma.evaluationScore.findMany({ where: { evaluationId }, orderBy: { dimension: 'asc' } });
    return rows.map(r => ({
      id: r.id, evaluationId: r.evaluationId, dimension: r.dimension as PerformanceDimension,
      rawScore: Number(r.rawScore), weightApplied: Number(r.weightApplied),
      weightedScore: Number(r.weightedScore), scoredBy: r.scoredBy as ScoreRow['scoredBy'],
    }));
  }
}

// ── Evaluation Weights ────────────────────────────────────────────────────────
@Injectable()
export class PrismaEvaluationWeightRepository implements EvaluationWeightRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveWeights(asOf: Date): Promise<DimensionWeight[]> {
    const rows = await this.prisma.evaluationWeight.findMany({
      where: {
        deletedAt: null,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    // De-duplicate: take the most-recent per dimension
    const seen = new Set<string>();
    const result: DimensionWeight[] = [];
    for (const r of rows) {
      if (!seen.has(r.dimension)) {
        seen.add(r.dimension);
        result.push({ dimension: r.dimension as PerformanceDimension, weight: Number(r.weight) });
      }
    }
    return result;
  }

  async setWeights(weights: DimensionWeight[], effectiveFrom: Date, actorUserId: string): Promise<void> {
    // Close current active weights
    await this.prisma.evaluationWeight.updateMany({
      where: { effectiveTo: null, deletedAt: null },
      data: { effectiveTo: new Date(effectiveFrom.getTime() - 86400000), updatedBy: actorUserId },
    });
    // Create new weight rows
    await this.prisma.evaluationWeight.createMany({
      data: weights.map(w => ({
        id: randomUUID(),
        dimension: w.dimension,
        weight: new Prisma.Decimal(w.weight),
        effectiveFrom,
        effectiveTo: null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      })),
    });
  }

  async listHistory(): Promise<Array<DimensionWeight & { effectiveFrom: Date; effectiveTo: Date | null }>> {
    const rows = await this.prisma.evaluationWeight.findMany({
      where: { deletedAt: null }, orderBy: { effectiveFrom: 'desc' },
    });
    return rows.map(r => ({
      dimension: r.dimension as PerformanceDimension, weight: Number(r.weight),
      effectiveFrom: r.effectiveFrom, effectiveTo: r.effectiveTo,
    }));
  }
}

// ── Probation Review ──────────────────────────────────────────────────────────
@Injectable()
export class PrismaProbationReviewRepository implements ProbationReviewRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<ProbationReview | null> {
    const row = await this.prisma.probationReview.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async findActiveForEmployee(employeeId: string): Promise<ProbationReview | null> {
    const row = await this.prisma.probationReview.findFirst({ where: { employeeId, outcome: 'pending', deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }
  async listByEmployee(employeeId: string): Promise<ProbationReview[]> {
    const rows = await this.prisma.probationReview.findMany({ where: { employeeId, deletedAt: null }, orderBy: { probationStartDate: 'desc' } });
    return rows.map(r => this.toDomain(r));
  }
  async save(review: ProbationReview, actorUserId: string): Promise<void> {
    const p = review.toPersistence();
    await this.prisma.probationReview.upsert({
      where: { id: p.id },
      create: {
        id: p.id, employeeId: p.employeeId, companyId: p.companyId,
        evaluationId: p.evaluationId ?? undefined,
        probationStartDate: p.probationStartDate, probationEndDate: p.probationEndDate,
        outcome: p.outcome, extendedUntil: p.extendedUntil ?? undefined,
        notes: p.notes ?? undefined, reviewedBy: p.reviewedBy ?? undefined,
        reviewedAt: p.reviewedAt ?? undefined,
        createdBy: actorUserId, updatedBy: actorUserId,
      },
      update: {
        outcome: p.outcome, extendedUntil: p.extendedUntil ?? undefined,
        notes: p.notes ?? undefined, reviewedBy: p.reviewedBy ?? undefined,
        reviewedAt: p.reviewedAt ?? undefined, updatedBy: actorUserId,
      },
    });
  }
  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.probationReview.update({ where: { id }, data: { deletedAt: new Date(), deletedBy: actorUserId } });
  }
  private toDomain(r: any): ProbationReview {
    return ProbationReview.rehydrate({
      id: r.id, employeeId: r.employeeId, companyId: r.companyId,
      evaluationId: r.evaluationId, probationStartDate: r.probationStartDate,
      probationEndDate: r.probationEndDate, outcome: r.outcome,
      extendedUntil: r.extendedUntil, notes: r.notes,
      reviewedBy: r.reviewedBy, reviewedAt: r.reviewedAt, deletedAt: r.deletedAt,
    });
  }
}

// ── Formula Version ───────────────────────────────────────────────────────────
@Injectable()
export class PrismaFormulaVersionRepository implements FormulaVersionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getActiveVersionId(key: string, asOf: Date): Promise<string | null> {
    const def = await this.prisma.formulaDefinition.findFirst({ where: { key, deletedAt: null } });
    if (!def) return null;
    const ver = await this.prisma.formulaVersion.findFirst({
      where: {
        formulaDefinitionId: def.id, isActive: true, deletedAt: null,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      orderBy: { version: 'desc' },
    });
    return ver?.id ?? null;
  }
}

// ── Employee Context ──────────────────────────────────────────────────────────
@Injectable()
export class PrismaEmployeeContextRepository implements EmployeeContextRepository {
  constructor(private readonly prisma: PrismaService) {}

  async getForEvaluation(employeeId: string, _companyId: string): Promise<EmployeeContext | null> {
    const emp = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { hireDate: true, employmentStatus: true, probationEndDate: true },
    });
    if (!emp) return null;
    return {
      hireDate: emp.hireDate,
      isOnProbation: emp.employmentStatus === 'probation',
      probationEndDate: emp.probationEndDate,
    };
  }
}

// ── Employee Status ───────────────────────────────────────────────────────────
@Injectable()
export class PrismaEmployeeStatusRepository implements EmployeeStatusRepository {
  constructor(private readonly prisma: PrismaService) {}

  async updateEmploymentStatus(
    employeeId: string,
    status: 'probation' | 'active' | 'suspended' | 'terminated',
    actorUserId: string,
    tx?: unknown,
  ): Promise<void> {
    // tx is a Prisma transaction client when provided; fall back to the service instance.
    // Cast to PrismaService which shares the same method surface for the calls we make.
    const client = (tx as PrismaService | undefined) ?? this.prisma;
    await client.employee.update({
      where: { id: employeeId },
      data: { employmentStatus: status, updatedBy: actorUserId },
    });
  }
}
