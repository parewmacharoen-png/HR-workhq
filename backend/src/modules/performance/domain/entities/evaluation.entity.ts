// ============================================================================
// modules/performance/domain/entities/evaluation.entity.ts
// Evaluation aggregate. A single evaluation per employee per cycle.
// Lifecycle: draft → submitted → finalized (human only — AI may not finalize).
// Carries grade, promotion readiness, salary review recommendation.
// ============================================================================

import {
  EvaluationAlreadyFinalizedError, AiCannotFinalizeError,
} from '../errors/performance.errors';
import type { Grade, PromotionReadiness, SalaryReviewAction } from '../services/scoring.service';

export type EvaluationStatus = 'draft' | 'submitted' | 'finalized';

export interface EvaluationProps {
  id: string;
  performanceCycleId: string;
  employeeId: string;
  companyId: string;
  totalScore: number;
  grade: Grade | null;
  promotionReadiness: PromotionReadiness | null;
  salaryReviewRecommendation: SalaryReviewAction | null;
  salaryIncreasePct: number | null;
  promotionNotes: string | null;
  status: EvaluationStatus;
  workflowInstanceId: string | null;
  formulaVersionId: string | null;
  aiRecommendationId: string | null;
  finalizedBy: string | null;
  deletedAt: Date | null;
}

export class EvaluationEntity {
  private constructor(private props: EvaluationProps) {}

  static rehydrate(props: EvaluationProps): EvaluationEntity {
    return new EvaluationEntity(props);
  }

  static create(input: {
    id: string;
    performanceCycleId: string;
    employeeId: string;
    companyId: string;
    formulaVersionId?: string | null;
  }): EvaluationEntity {
    return new EvaluationEntity({
      id: input.id,
      performanceCycleId: input.performanceCycleId,
      employeeId: input.employeeId,
      companyId: input.companyId,
      totalScore: 0,
      grade: null,
      promotionReadiness: null,
      salaryReviewRecommendation: null,
      salaryIncreasePct: null,
      promotionNotes: null,
      status: 'draft',
      workflowInstanceId: null,
      formulaVersionId: input.formulaVersionId ?? null,
      aiRecommendationId: null,
      finalizedBy: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get status(): EvaluationStatus { return this.props.status; }
  get employeeId(): string { return this.props.employeeId; }
  get companyId(): string { return this.props.companyId; }
  get grade(): Grade | null { return this.props.grade; }
  get isFinalized(): boolean { return this.props.status === 'finalized'; }

  applyScores(input: {
    totalScore: number;
    grade: Grade;
    promotionReadiness: PromotionReadiness;
    salaryReviewRecommendation: SalaryReviewAction;
    salaryIncreasePct: number | null;
  }): void {
    if (this.isFinalized) throw new EvaluationAlreadyFinalizedError();
    this.props.totalScore = input.totalScore;
    this.props.grade = input.grade;
    this.props.promotionReadiness = input.promotionReadiness;
    this.props.salaryReviewRecommendation = input.salaryReviewRecommendation;
    this.props.salaryIncreasePct = input.salaryIncreasePct;
  }

  attachWorkflow(instanceId: string): void {
    this.props.workflowInstanceId = instanceId;
  }

  attachAiRecommendation(recId: string): void {
    this.props.aiRecommendationId = recId;
  }

  addNote(note: string): void {
    this.props.promotionNotes = note;
  }

  submit(): void {
    if (this.isFinalized) throw new EvaluationAlreadyFinalizedError();
    this.props.status = 'submitted';
  }

  /** AI cannot finalize — only human actors may. */
  finalize(actorUserId: string, isAiActor: boolean): void {
    if (isAiActor) throw new AiCannotFinalizeError();
    if (this.isFinalized) throw new EvaluationAlreadyFinalizedError();
    this.props.status = 'finalized';
    this.props.finalizedBy = actorUserId;
  }

  toPersistence(): EvaluationProps {
    return { ...this.props };
  }
}
