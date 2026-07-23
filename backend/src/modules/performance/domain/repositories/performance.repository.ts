// ============================================================================
// modules/performance/domain/repositories/performance.repository.ts
// ============================================================================

import { EvaluationEntity } from '../entities/evaluation.entity';
import { ProbationReview } from '../entities/probation-review.entity';
import type { DimensionWeight, PerformanceDimension, ScoredDimension } from '../services/scoring.service';

export const PERFORMANCE_CYCLE_REPOSITORY  = Symbol('PERFORMANCE_CYCLE_REPOSITORY');
export const EVALUATION_REPOSITORY         = Symbol('EVALUATION_REPOSITORY');
export const EVALUATION_SCORE_REPOSITORY   = Symbol('EVALUATION_SCORE_REPOSITORY');
export const EVALUATION_WEIGHT_REPOSITORY  = Symbol('EVALUATION_WEIGHT_REPOSITORY');
export const PROBATION_REVIEW_REPOSITORY   = Symbol('PROBATION_REVIEW_REPOSITORY');
export const FORMULA_VERSION_REPOSITORY    = Symbol('FORMULA_VERSION_REPOSITORY');

export type CycleStatus = 'open' | 'locked' | 'finalized';

export interface CycleRow {
  id: string;
  companyId: string | null;
  periodStart: Date;
  periodEnd: Date;
  status: CycleStatus;
}

export interface ScoreRow {
  id: string;
  evaluationId: string;
  dimension: PerformanceDimension;
  rawScore: number;
  weightApplied: number;
  weightedScore: number;
  scoredBy: 'system' | 'manager' | 'owner' | 'ai';
}

export interface PerformanceCycleRepository {
  findById(id: string): Promise<CycleRow | null>;
  findOpenForCompany(companyId: string): Promise<CycleRow | null>;
  listByCompany(companyId: string): Promise<CycleRow[]>;
  create(input: { id: string; companyId: string | null; periodStart: Date; periodEnd: Date; actorUserId: string }): Promise<void>;
  updateStatus(id: string, status: CycleStatus, actorUserId: string): Promise<void>;
}

export interface EvaluationRepository {
  findById(id: string): Promise<EvaluationEntity | null>;
  findByCycleAndEmployee(cycleId: string, employeeId: string): Promise<EvaluationEntity | null>;
  findByEmployee(employeeId: string, limit?: number): Promise<EvaluationEntity[]>;
  findByCycle(cycleId: string): Promise<EvaluationEntity[]>;
  findByWorkflowEntity(entityId: string): Promise<EvaluationEntity | null>;
  save(evaluation: EvaluationEntity, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface EvaluationScoreRepository {
  upsertScores(
    evaluationId: string,
    scores: ScoredDimension[],
    scoredBy: 'system' | 'manager' | 'owner' | 'ai',
    actorUserId: string,
  ): Promise<void>;
  listByEvaluation(evaluationId: string): Promise<ScoreRow[]>;
}

export interface EvaluationWeightRepository {
  /** Returns the active weight config as-of the given date. */
  getActiveWeights(asOf: Date): Promise<DimensionWeight[]>;
  /** Replace the full weight set with a new effective date. */
  setWeights(
    weights: DimensionWeight[],
    effectiveFrom: Date,
    actorUserId: string,
  ): Promise<void>;
  listHistory(): Promise<Array<DimensionWeight & { effectiveFrom: Date; effectiveTo: Date | null }>>;
}

export interface ProbationReviewRepository {
  findById(id: string): Promise<ProbationReview | null>;
  findActiveForEmployee(employeeId: string): Promise<ProbationReview | null>;
  listByEmployee(employeeId: string): Promise<ProbationReview[]>;
  save(review: ProbationReview, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface FormulaVersionRepository {
  /** Get the active formula version id for 'performance.scoring' as-of a date. */
  getActiveVersionId(key: string, asOf: Date): Promise<string | null>;
}

export interface EmployeeContext {
  hireDate: Date;
  isOnProbation: boolean;
  probationEndDate: Date | null;
}

export interface EmployeeContextRepository {
  getForEvaluation(employeeId: string, companyId: string): Promise<EmployeeContext | null>;
}
export const EMPLOYEE_CONTEXT_REPOSITORY = Symbol('EMPLOYEE_CONTEXT_REPOSITORY');

// ── Employee status update (used when probation passes) ───────────────────────
export const EMPLOYEE_STATUS_REPOSITORY = Symbol('EMPLOYEE_STATUS_REPOSITORY');

export interface EmployeeStatusRepository {
  /**
   * Update an employee's employment_status column.
   * The optional tx parameter accepts any Prisma transaction client so the caller
   * can run this atomically with other writes. Typed as unknown here because
   * the generated Prisma transaction type is only available after prisma generate.
   */
  updateEmploymentStatus(
    employeeId: string,
    status: 'probation' | 'active' | 'suspended' | 'terminated',
    actorUserId: string,
    tx?: unknown,
  ): Promise<void>;
}
