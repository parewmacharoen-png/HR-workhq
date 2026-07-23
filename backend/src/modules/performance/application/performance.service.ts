// ============================================================================
// modules/performance/application/performance.service.ts
// Orchestrates:
//   1. Performance cycles (open / lock / finalize)
//   2. Evaluations (create → score → submit → finalize)
//   3. Weight management (set versioned weights, view history)
//   4. Probation tracking (create → resolve)
//   5. Leader / Owner scoring (same path, different scoredBy)
//   6. Workflow integration (submit opens workflow; react to resolution)
//   7. Historical tracking (list evaluations per employee)
//   8. Grade / promotion / salary review recommendations (from ScoringService)
// ============================================================================

import { Inject, Injectable, Logger, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  PERFORMANCE_CYCLE_REPOSITORY, EVALUATION_REPOSITORY,
  EVALUATION_SCORE_REPOSITORY, EVALUATION_WEIGHT_REPOSITORY,
  PROBATION_REVIEW_REPOSITORY, FORMULA_VERSION_REPOSITORY,
  EMPLOYEE_CONTEXT_REPOSITORY, EMPLOYEE_STATUS_REPOSITORY,
  PerformanceCycleRepository, EvaluationRepository,
  EvaluationScoreRepository, EvaluationWeightRepository,
  ProbationReviewRepository, FormulaVersionRepository,
  EmployeeContextRepository, EmployeeStatusRepository,
} from '../domain/repositories/performance.repository';
import { EvaluationEntity } from '../domain/entities/evaluation.entity';
import { ProbationReview } from '../domain/entities/probation-review.entity';
import { ScoringService, DEFAULT_SCORING_CONFIG } from '../domain/services/scoring.service';
import {
  EvaluationAlreadyExistsError, EvaluationNotFoundError,
  ProbationReviewNotFoundError, CycleNotOpenError,
  PerformanceCycleNotFoundError,
} from '../domain/errors/performance.errors';
import {
  OpenCycleDto, CreateEvaluationDto, SubmitScoresDto, FinalizeEvaluationDto,
  SetWeightsDto, CreateProbationReviewDto, ResolveProbationDto,
  CycleResponse, EvaluationResponse, EvaluationScoreResponse,
  ProbationReviewResponse, WeightHistoryResponse,
  ProbationDashboardResponse,
  ProbationDashboardReviewItem,
} from './dto/performance.dto';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { ExitCaseService } from '../../exit/application/exit-case.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ValidationError } from '../../../shared/kernel/domain-error';
import { ProbationReviewTelegramNotifier } from '../../telegram/application/probation-review.notifier';
import { EmployeeReferralService } from '../../request/application/employee-referral.service';
import { daysUntilBangkok } from '../../employee/domain/services/employee-date-events.service';

const DEFAULT_PROBATION_EXTENSION_DAYS = 30;
const DEFAULT_PROBATION_PERIOD_DAYS = 90;
const SYSTEM_ACTOR_USER_ID = '00000000-0000-4000-8000-000000000001';

type NormalizedProbationOutcome = 'passed' | 'extended' | 'failed';

function normalizeProbationOutcome(outcome: ResolveProbationDto['outcome']): NormalizedProbationOutcome {
  const map: Record<string, NormalizedProbationOutcome> = {
    passed: 'passed',
    PASS: 'passed',
    extended: 'extended',
    EXTEND: 'extended',
    failed: 'failed',
    FAIL: 'failed',
  };
  const normalized = map[outcome];
  if (!normalized) throw new ValidationError(`Invalid probation outcome: ${outcome}`);
  return normalized;
}

@Injectable()
export class PerformanceService {
  private readonly logger = new Logger(PerformanceService.name);
  private readonly scoring = new ScoringService(DEFAULT_SCORING_CONFIG);

  constructor(
    @Inject(PERFORMANCE_CYCLE_REPOSITORY)  private readonly cycles: PerformanceCycleRepository,
    @Inject(EVALUATION_REPOSITORY)         private readonly evaluations: EvaluationRepository,
    @Inject(EVALUATION_SCORE_REPOSITORY)   private readonly scores: EvaluationScoreRepository,
    @Inject(EVALUATION_WEIGHT_REPOSITORY)  private readonly weights: EvaluationWeightRepository,
    @Inject(PROBATION_REVIEW_REPOSITORY)   private readonly probations: ProbationReviewRepository,
    @Inject(FORMULA_VERSION_REPOSITORY)    private readonly formulaVersions: FormulaVersionRepository,
    @Inject(EMPLOYEE_CONTEXT_REPOSITORY)   private readonly employeeCtx: EmployeeContextRepository,
    @Inject(EMPLOYEE_STATUS_REPOSITORY)    private readonly employeeStatus: EmployeeStatusRepository,
    private readonly workflow: WorkflowService,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    @Optional() @Inject(forwardRef(() => ExitCaseService))
    private readonly exitCases?: ExitCaseService,
    @Optional() @Inject(forwardRef(() => ProbationReviewTelegramNotifier))
    private readonly probationTelegram?: ProbationReviewTelegramNotifier,
    @Optional() @Inject(forwardRef(() => EmployeeReferralService))
    private readonly employeeReferrals?: EmployeeReferralService,
  ) {}

  // ══ Performance Cycles ═════════════════════════════════════════════════════

  async openCycle(actor: ActorContext, dto: OpenCycleDto): Promise<CycleResponse> {
    if (dto.companyId) {
      await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    } else {
      await this.companyAccess.assertCompanyAccess(actor, null);
    }
    const id = randomUUID();
    await this.cycles.create({
      id,
      companyId: dto.companyId ?? null,
      periodStart: new Date(dto.periodStart),
      periodEnd: new Date(dto.periodEnd),
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, { entityType: 'PerformanceCycle', entityId: id, action: 'open' });
    return { id, companyId: dto.companyId ?? null, periodStart: dto.periodStart, periodEnd: dto.periodEnd, status: 'open' };
  }

  async lockCycle(actor: ActorContext, cycleId: string): Promise<CycleResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    await this.cycles.updateStatus(cycleId, 'locked', actor.userId);
    await this.audit.record(actor, { entityType: 'PerformanceCycle', entityId: cycleId, action: 'lock' });
    return { ...cycle, periodStart: cycle.periodStart.toISOString().slice(0, 10), periodEnd: cycle.periodEnd.toISOString().slice(0, 10), status: 'locked' };
  }

  async finalizeCycle(actor: ActorContext, cycleId: string): Promise<CycleResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    await this.cycles.updateStatus(cycleId, 'finalized', actor.userId);
    await this.audit.record(actor, { entityType: 'PerformanceCycle', entityId: cycleId, action: 'finalize' });
    return { ...cycle, periodStart: cycle.periodStart.toISOString().slice(0, 10), periodEnd: cycle.periodEnd.toISOString().slice(0, 10), status: 'finalized' };
  }

  async listCycles(actor: ActorContext, companyId: string): Promise<CycleResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const list = await this.cycles.listByCompany(companyId);
    return list.map(c => ({ ...c, periodStart: c.periodStart.toISOString().slice(0, 10), periodEnd: c.periodEnd.toISOString().slice(0, 10) }));
  }

  // ══ Evaluations ═══════════════════════════════════════════════════════════

  async createEvaluation(actor: ActorContext, dto: CreateEvaluationDto): Promise<EvaluationResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const cycle = await this.getCycleOrThrow(actor, dto.cycleId);
    if (cycle.status !== 'open') throw new CycleNotOpenError();

    const existing = await this.evaluations.findByCycleAndEmployee(dto.cycleId, dto.employeeId);
    if (existing) throw new EvaluationAlreadyExistsError();

    const formulaVersionId = await this.formulaVersions.getActiveVersionId(
      'performance.scoring', new Date(),
    );

    const evaluation = EvaluationEntity.create({
      id: randomUUID(),
      performanceCycleId: dto.cycleId,
      employeeId: dto.employeeId,
      companyId: dto.companyId,
      formulaVersionId,
    });

    await this.evaluations.save(evaluation, actor.userId);
    await this.audit.record(actor, { entityType: 'Evaluation', entityId: evaluation.id, action: 'create', after: evaluation.toPersistence() });
    return this.toEvalResponse(evaluation);
  }

  /**
   * Submit scores from a specific role (manager / owner / system / ai).
   * Computes the weighted total, grade, and all recommendations from the
   * active weight config as-of today. Applies results to the evaluation.
   * AI may score but CANNOT finalize (enforced in finalize()).
   */
  async submitScores(
    actor: ActorContext,
    evaluationId: string,
    dto: SubmitScoresDto,
  ): Promise<EvaluationResponse> {
    const evaluation = await this.getEvaluationOrThrow(actor, evaluationId);

    // Fetch weight config active on today's date
    const activeWeights = await this.weights.getActiveWeights(new Date());

    // Fetch employee context for recommendations
    const ctx = await this.employeeCtx.getForEvaluation(evaluation.employeeId, evaluation.companyId);
    const tenureMonths = ctx ? this.monthsBetween(ctx.hireDate, new Date()) : 0;
    const isOnProbation = ctx?.isOnProbation ?? false;

    // Compute scores
    const result = this.scoring.evaluate({
      rawScores: dto.scores,
      weights: activeWeights,
      tenureMonths,
      isOnProbation,
    });

    // Apply to entity
    evaluation.applyScores({
      totalScore: result.totalScore,
      grade: result.grade,
      promotionReadiness: result.promotionReadiness,
      salaryReviewRecommendation: result.salaryReviewAction,
      salaryIncreasePct: result.salaryIncreasePct,
    });

    // Upsert dimension score rows
    await this.scores.upsertScores(evaluationId, result.scores, dto.scoredBy, actor.userId);
    await this.evaluations.save(evaluation, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Evaluation', entityId: evaluationId, action: 'score',
      after: { scoredBy: dto.scoredBy, totalScore: result.totalScore, grade: result.grade },
    });
    return this.toEvalResponse(evaluation);
  }

  /**
   * Submit evaluation for approval workflow (opens performance_review workflow).
   */
  async submitForApproval(actor: ActorContext, evaluationId: string): Promise<EvaluationResponse> {
    const evaluation = await this.getEvaluationOrThrow(actor, evaluationId);

    evaluation.submit();
    const { instanceId } = await this.workflow.start(actor, {
      entityType: 'performance_review',
      entityId: evaluationId,
      companyId: evaluation.companyId,
    });
    evaluation.attachWorkflow(instanceId);
    await this.evaluations.save(evaluation, actor.userId);
    await this.audit.record(actor, { entityType: 'Evaluation', entityId: evaluationId, action: 'submit', after: { workflowInstanceId: instanceId } });
    return this.toEvalResponse(evaluation);
  }

  /** Finalize — human only. AI actors are blocked by the entity. */
  async finalizeEvaluation(
    actor: ActorContext,
    evaluationId: string,
    dto: FinalizeEvaluationDto,
    isAiActor = false,
  ): Promise<EvaluationResponse> {
    const evaluation = await this.getEvaluationOrThrow(actor, evaluationId);

    if (dto.promotionNotes) evaluation.addNote(dto.promotionNotes);
    evaluation.finalize(actor.userId, isAiActor);
    await this.evaluations.save(evaluation, actor.userId);
    await this.audit.record(actor, { entityType: 'Evaluation', entityId: evaluationId, action: 'finalize', after: evaluation.toPersistence() });
    return this.toEvalResponse(evaluation);
  }

  /** Outbox handler: react when performance_review workflow is approved/rejected. */
  async onWorkflowResolved(entityId: string, status: 'approved' | 'rejected' | 'cancelled'): Promise<void> {
    const evaluation = await this.evaluations.findByWorkflowEntity(entityId);
    if (!evaluation) return;
    if (status === 'approved') {
      // Auto-finalize when approved through workflow (by the workflow approver, not AI)
      evaluation.finalize('workflow_system', false);
    } else {
      // Rejected/cancelled → return to draft so reviewer can re-score
      // We use a status revert not modelled on the entity — handled via direct DB update
    }
    await this.evaluations.save(evaluation, 'workflow_system');
  }

  async getEvaluation(actor: ActorContext, id: string): Promise<EvaluationResponse> {
    const e = await this.getEvaluationOrThrow(actor, id);
    return this.toEvalResponse(e);
  }

  async getEvaluationScores(actor: ActorContext, evaluationId: string): Promise<EvaluationScoreResponse[]> {
    await this.getEvaluationOrThrow(actor, evaluationId);
    const rows = await this.scores.listByEvaluation(evaluationId);
    return rows.map(r => ({
      dimension: r.dimension, rawScore: r.rawScore,
      weightApplied: r.weightApplied, weightedScore: r.weightedScore, scoredBy: r.scoredBy,
    }));
  }

  async listEvaluationsForEmployee(actor: ActorContext, employeeId: string): Promise<EvaluationResponse[]> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const list = await this.evaluations.findByEmployee(employeeId);
    return list.map(e => this.toEvalResponse(e));
  }

  async listEvaluationsForCycle(actor: ActorContext, cycleId: string): Promise<EvaluationResponse[]> {
    await this.getCycleOrThrow(actor, cycleId);
    const list = await this.evaluations.findByCycle(cycleId);
    return list.map(e => this.toEvalResponse(e));
  }

  // ══ Weight management ══════════════════════════════════════════════════════

  async setWeights(actor: ActorContext, dto: SetWeightsDto): Promise<void> {
    // Validate sum before persisting
    this.scoring.validateWeights(dto.weights);
    await this.weights.setWeights(dto.weights, new Date(dto.effectiveFrom), actor.userId);
    await this.audit.record(actor, { entityType: 'EvaluationWeight', entityId: actor.userId, action: 'set_weights', after: dto });
  }

  async getActiveWeights(actor: ActorContext, companyId?: string): Promise<WeightHistoryResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId ?? null);
    const history = await this.weights.listHistory();
    return history.map(w => ({
      dimension: w.dimension,
      weight: w.weight,
      effectiveFrom: (w.effectiveFrom as Date).toISOString().slice(0, 10),
      effectiveTo: w.effectiveTo ? (w.effectiveTo as Date).toISOString().slice(0, 10) : null,
    }));
  }

  // ══ Probation tracking ═════════════════════════════════════════════════════

  async createProbationReview(actor: ActorContext, dto: CreateProbationReviewDto): Promise<ProbationReviewResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    await this.employeeAccess.assertEmployeeInCompany(dto.employeeId, dto.companyId);
    const review = ProbationReview.create({
      id: randomUUID(),
      employeeId: dto.employeeId,
      companyId: dto.companyId,
      probationStartDate: new Date(dto.probationStartDate),
      probationEndDate: new Date(dto.probationEndDate),
      evaluationId: dto.evaluationId ?? null,
      notes: dto.notes ?? null,
    });
    await this.probations.save(review, actor.userId);
    await this.audit.record(actor, { entityType: 'ProbationReview', entityId: review.id, action: 'create', after: review.toPersistence() });
    return this.toProbationResponse(review);
  }

  async resolveProbation(actor: ActorContext, id: string, dto: ResolveProbationDto): Promise<ProbationReviewResponse> {
    const review = await this.getProbationOrThrow(actor, id);
    const outcome = normalizeProbationOutcome(dto.outcome);

    const before = review.toPersistence();
    switch (outcome) {
      case 'passed':
        review.pass(actor.userId);
        break;
      case 'extended': {
        const extendedUntil = this.resolveExtensionDate(review.toPersistence().probationEndDate, dto);
        review.extend(extendedUntil, actor.userId, dto.notes);
        break;
      }
      case 'failed':
        review.fail(actor.userId, dto.notes);
        break;
    }

    if (outcome === 'passed') {
      await this.prisma.$transaction(async (tx: unknown) => {
        await this.probations.save(review, actor.userId);
        await this.employeeStatus.updateEmploymentStatus(
          review.employeeId,
          'active',
          actor.userId,
          tx,
        );
      });
    } else if (outcome === 'extended') {
      const extendedUntil = review.toPersistence().extendedUntil!;
      const priorEndDate = before.probationEndDate;
      await this.prisma.$transaction(async (tx) => {
        await this.probations.save(review, actor.userId);
        await tx.employee.update({
          where: { id: review.employeeId },
          data: { probationEndDate: extendedUntil, updatedBy: actor.userId },
        });
      });

      const nextReview = ProbationReview.create({
        id: randomUUID(),
        employeeId: review.employeeId,
        companyId: before.companyId,
        probationStartDate: priorEndDate,
        probationEndDate: extendedUntil,
        notes: 'Auto-created after EXTEND (EMP-010b)',
      });
      await this.probations.save(nextReview, actor.userId);
    } else {
      await this.probations.save(review, actor.userId);
      if (this.exitCases) {
        const p = review.toPersistence();
        await this.exitCases.create(actor, review.employeeId, {
          companyId: p.companyId,
          exitReason: 'performance_failure',
          effectiveTerminationDate: new Date().toISOString().slice(0, 10),
          notes: dto.notes ?? 'Probation review failed (EMP-010 / EMP-010b)',
          sourceType: 'probation_review',
          sourceId: id,
        });
      } else {
        this.logger.warn(
          `Probation FAIL for ${review.employeeId} — ExitCaseService unavailable; see EMP-010c / EXIT workflow cross-reference`,
        );
      }
    }

    await this.audit.record(actor, {
      entityType: 'ProbationReview', entityId: id, action: 'resolve',
      before, after: review.toPersistence(),
    });

    const response = await this.toProbationResponse(review);
    if (outcome === 'passed' && this.employeeReferrals) {
      await this.employeeReferrals.onProbationPassed(review.employeeId, id).catch((err) => {
        this.logger.warn(`REC-002 referral hook failed for employee ${review.employeeId}: ${String(err)}`);
      });
    }
    if (this.probationTelegram) {
      await this.probationTelegram.notifyOutcomeResolved(response, outcome).catch(() => undefined);
    }
    return response;
  }

  async listProbationsForEmployee(actor: ActorContext, employeeId: string): Promise<ProbationReviewResponse[]> {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const list = await this.probations.listByEmployee(employeeId);
    return Promise.all(list.map((r) => this.toProbationResponse(r)));
  }

  async listPendingProbationReviews(actor: ActorContext, companyId: string): Promise<ProbationReviewResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.probationReview.findMany({
      where: { companyId, outcome: 'pending', deletedAt: null },
      orderBy: { probationEndDate: 'asc' },
    });
    return Promise.all(rows.map((row) => this.toProbationResponseFromRow(row)));
  }

  /** EMP-010b — dashboard widget: pending reviews + probation ending soon. */
  async getProbationDashboard(
    actor: ActorContext,
    companyId: string,
    asOf: Date = new Date(),
  ): Promise<ProbationDashboardResponse> {
    const pendingRows = await this.listPendingProbationReviews(actor, companyId);
    const pendingReviews: ProbationDashboardReviewItem[] = await Promise.all(
      pendingRows.map(async (review) => {
        const employee = await this.prisma.employee.findFirst({
          where: { id: review.employeeId, deletedAt: null },
          select: { firstName: true, lastName: true },
        });
        const endDate = new Date(review.probationEndDate);
        return {
          ...review,
          employeeName: employee
            ? `${employee.firstName} ${employee.lastName}`.trim()
            : review.employeeId,
          daysRemaining: daysUntilBangkok(endDate, asOf),
        };
      }),
    );

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: 'probation',
        probationEndDate: { not: null },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        probationEndDate: true,
        hireDate: true,
      },
    });

    const endingSoon = [];
    for (const employee of employees) {
      if (!employee.probationEndDate) continue;
      const daysRemaining = daysUntilBangkok(employee.probationEndDate, asOf);
      if (daysRemaining > 30) continue;

      const pendingReview = await this.prisma.probationReview.findFirst({
        where: {
          employeeId: employee.id,
          companyId,
          outcome: 'pending',
          deletedAt: null,
        },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });

      endingSoon.push({
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
        department: employee.department,
        position: employee.position,
        probationEndDate: employee.probationEndDate.toISOString().slice(0, 10),
        daysRemaining,
        pendingReviewId: pendingReview?.id ?? null,
      });
    }

    endingSoon.sort((a, b) => a.daysRemaining - b.daysRemaining);
    return { pendingReviews, endingSoon };
  }

  /** EMP-010b — auto-create pending review when onboarding with probation status. */
  async bootstrapProbationReviewOnOnboarding(
    actor: ActorContext,
    input: {
      employeeId: string;
      companyId: string;
      hireDate: Date;
      probationEndDate: Date | null;
      employmentStatus: string;
    },
  ): Promise<ProbationReviewResponse | null> {
    if (input.employmentStatus !== 'probation') return null;

    const probationEndDate = input.probationEndDate
      ?? addUtcDays(input.hireDate, DEFAULT_PROBATION_PERIOD_DAYS);

    if (!input.probationEndDate) {
      await this.prisma.employee.update({
        where: { id: input.employeeId },
        data: { probationEndDate, updatedBy: actor.userId },
      });
    }

    const existing = await this.probations.findActiveForEmployee(input.employeeId);
    if (existing) return this.toProbationResponse(existing);

    const review = ProbationReview.create({
      id: randomUUID(),
      employeeId: input.employeeId,
      companyId: input.companyId,
      probationStartDate: input.hireDate,
      probationEndDate,
      notes: 'Auto-created on onboarding (EMP-010b)',
    });
    await this.probations.save(review, actor.userId);
    await this.audit.record(actor, {
      entityType: 'ProbationReview',
      entityId: review.id,
      action: 'bootstrap_onboarding',
      after: review.toPersistence(),
    });
    return this.toProbationResponse(review);
  }

  /** EMP-010b — ensure pending review exists (scheduler / reminders). */
  async ensurePendingProbationReview(
    employeeId: string,
    companyId: string,
    hireDate: Date,
    probationEndDate: Date,
  ): Promise<string | null> {
    const existing = await this.probations.findActiveForEmployee(employeeId);
    if (existing) return existing.id;

    const actor: ActorContext = {
      userId: SYSTEM_ACTOR_USER_ID,
      impersonatorUserId: null,
      companyId: null,
    };
    const review = ProbationReview.create({
      id: randomUUID(),
      employeeId,
      companyId,
      probationStartDate: hireDate,
      probationEndDate,
      notes: 'Auto-created for probation reminder (EMP-010b)',
    });
    await this.probations.save(review, actor.userId);
    return review.id;
  }

  /** EMP-010b — Telegram inline PASS / EXTEND / FAIL from leader callback. */
  async resolveProbationFromTelegram(
    userId: string,
    reviewId: string,
    dto: ResolveProbationDto,
  ): Promise<ProbationReviewResponse> {
    const review = await this.probations.findById(reviewId);
    if (!review) throw new ProbationReviewNotFoundError(reviewId);
    const p = review.toPersistence();
    if (p.outcome !== 'pending') {
      throw new ValidationError('Probation review is already resolved');
    }

    await this.assertCanResolveProbationViaTelegram(userId, p.companyId);

    const actor: ActorContext = { userId, impersonatorUserId: null, companyId: null };
    return this.resolveProbation(actor, reviewId, dto);
  }

  private async assertCanResolveProbationViaTelegram(userId: string, companyId: string): Promise<void> {
    const access = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId, isActive: true, deletedAt: null },
      select: { role: true },
    });
    const role = access?.role;
    if (role === 'owner') return;

    await this.companyAccess.assertCompanyAccess(
      { userId, impersonatorUserId: null, companyId: null },
      companyId,
    );

    if (role === 'secretary' || role === 'big_leader') return;
    throw new ValidationError('Only leaders may resolve probation reviews via Telegram');
  }

  private resolveExtensionDate(probationEndDate: Date, dto: ResolveProbationDto): Date {
    if (dto.extendedUntil) return new Date(dto.extendedUntil);
    const days = dto.extensionDays ?? DEFAULT_PROBATION_EXTENSION_DAYS;
    const extended = new Date(probationEndDate);
    extended.setUTCDate(extended.getUTCDate() + days);
    return extended;
  }

  private async toProbationResponseFromRow(row: {
    id: string;
    employeeId: string;
    companyId: string;
    probationStartDate: Date;
    probationEndDate: Date;
    outcome: string;
    extendedUntil: Date | null;
    notes: string | null;
    reviewedBy: string | null;
    reviewedAt: Date | null;
    createdAt: Date;
  }): Promise<ProbationReviewResponse> {
    const reviewer = row.reviewedBy
      ? await this.prisma.user.findFirst({
          where: { id: row.reviewedBy, deletedAt: null },
          include: { employee: { select: { firstName: true, lastName: true } } },
        })
      : null;
    const reviewerName = reviewer?.employee
      ? `${reviewer.employee.firstName} ${reviewer.employee.lastName}`.trim()
      : reviewer?.username ?? null;

    return {
      id: row.id,
      employeeId: row.employeeId,
      companyId: row.companyId,
      probationStartDate: row.probationStartDate.toISOString().slice(0, 10),
      probationEndDate: row.probationEndDate.toISOString().slice(0, 10),
      outcome: row.outcome,
      extendedUntil: row.extendedUntil ? row.extendedUntil.toISOString().slice(0, 10) : null,
      notes: row.notes,
      reviewedBy: row.reviewedBy,
      reviewerName,
      reviewedAt: row.reviewedAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
    };
  }

  // ══ Mappers ═══════════════════════════════════════════════════════════════

  private async getCycleOrThrow(actor: ActorContext, cycleId: string) {
    const cycle = await this.cycles.findById(cycleId);
    if (!cycle) throw new PerformanceCycleNotFoundError(cycleId);
    await this.companyAccess.assertCompanyAccess(actor, cycle.companyId);
    return cycle;
  }

  private async getEvaluationOrThrow(actor: ActorContext, id: string): Promise<EvaluationEntity> {
    const e = await this.evaluations.findById(id);
    if (!e) throw new EvaluationNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, e.companyId);
    return e;
  }

  private async getProbationOrThrow(actor: ActorContext, id: string): Promise<ProbationReview> {
    const review = await this.probations.findById(id);
    if (!review) throw new ProbationReviewNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, review.toPersistence().companyId);
    return review;
  }

  private toEvalResponse(e: EvaluationEntity): EvaluationResponse {
    const p = e.toPersistence();
    return {
      id: p.id, employeeId: p.employeeId, cycleId: p.performanceCycleId,
      companyId: p.companyId, totalScore: p.totalScore,
      grade: p.grade, promotionReadiness: p.promotionReadiness,
      salaryReviewRecommendation: p.salaryReviewRecommendation,
      salaryIncreasePct: p.salaryIncreasePct, status: p.status,
      workflowInstanceId: p.workflowInstanceId,
    };
  }

  private async toProbationResponse(r: ProbationReview): Promise<ProbationReviewResponse> {
    const p = r.toPersistence();
    return this.toProbationResponseFromRow({
      ...p,
      createdAt: new Date(),
    });
  }

  private monthsBetween(from: Date, to: Date): number {
    return Math.floor((to.getTime() - from.getTime()) / (1000 * 60 * 60 * 24 * 30.44));
  }
}

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}
