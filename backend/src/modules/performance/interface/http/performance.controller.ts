// ============================================================================
// modules/performance/interface/http/performance.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { PerformanceService } from '../../application/performance.service';
import {
  OpenCycleDto, CreateEvaluationDto, SubmitScoresDto, FinalizeEvaluationDto,
  SetWeightsDto, CreateProbationReviewDto, ResolveProbationDto,
} from '../../application/dto/performance.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('performance')
export class PerformanceController {
  constructor(private readonly service: PerformanceService) {}

  // ── Cycles ─────────────────────────────────────────────────────────────────
  @Post('cycles')
  @RequirePermission('performance:write')
  openCycle(@CurrentActor() actor: ActorContext, @Body() dto: OpenCycleDto) {
    return this.service.openCycle(actor, dto);
  }

  @Get('cycles')
  @RequirePermission('performance:read')
  listCycles(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.service.listCycles(actor, companyId);
  }

  @Patch('cycles/:id/lock')
  @RequirePermission('performance:write')
  lockCycle(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.lockCycle(actor, id);
  }

  @Patch('cycles/:id/finalize')
  @RequirePermission('performance:write')
  finalizeCycle(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.finalizeCycle(actor, id);
  }

  // ── Evaluations ────────────────────────────────────────────────────────────
  @Post('evaluations')
  @RequirePermission('performance:write')
  createEvaluation(@CurrentActor() actor: ActorContext, @Body() dto: CreateEvaluationDto) {
    return this.service.createEvaluation(actor, dto);
  }

  @Get('evaluations/:id')
  @RequirePermission('performance:read')
  getEvaluation(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getEvaluation(actor, id);
  }

  @Get('evaluations/:id/scores')
  @RequirePermission('performance:read')
  getScores(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getEvaluationScores(actor, id);
  }

  /** Leader or system submits dimension scores for an evaluation. */
  @Post('evaluations/:id/scores')
  @RequirePermission('performance:score')
  submitScores(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: SubmitScoresDto,
  ) {
    return this.service.submitScores(actor, id, dto);
  }

  /** Submit the evaluation for owner/HR approval workflow. */
  @Post('evaluations/:id/submit')
  @RequirePermission('performance:write')
  submitForApproval(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.submitForApproval(actor, id);
  }

  /** Human finalizes evaluation (AI blocked at entity layer). */
  @Post('evaluations/:id/finalize')
  @RequirePermission('performance:finalize')
  finalizeEvaluation(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: FinalizeEvaluationDto,
  ) {
    return this.service.finalizeEvaluation(actor, id, dto);
  }

  /** History: all evaluations for one employee (chronological). */
  @Get('employees/:employeeId/evaluations')
  @RequirePermission('performance:read')
  listForEmployee(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string) {
    return this.service.listEvaluationsForEmployee(actor, employeeId);
  }

  /** All evaluations in one cycle (for manager / HR review view). */
  @Get('cycles/:cycleId/evaluations')
  @RequirePermission('performance:read')
  listForCycle(@CurrentActor() actor: ActorContext, @Param('cycleId') cycleId: string) {
    return this.service.listEvaluationsForCycle(actor, cycleId);
  }

  // ── Weights ────────────────────────────────────────────────────────────────
  @Post('weights')
  @RequirePermission('performance:configure')
  setWeights(@CurrentActor() actor: ActorContext, @Body() dto: SetWeightsDto) {
    return this.service.setWeights(actor, dto);
  }

  @Get('weights')
  @RequirePermission('performance:read')
  getWeights(@CurrentActor() actor: ActorContext, @Query('companyId') companyId?: string) {
    return this.service.getActiveWeights(actor, companyId);
  }

  // ── Probation ──────────────────────────────────────────────────────────────
  @Post('probation')
  @RequirePermission('performance:write')
  createProbation(@CurrentActor() actor: ActorContext, @Body() dto: CreateProbationReviewDto) {
    return this.service.createProbationReview(actor, dto);
  }

  @Patch('probation/:id/resolve')
  @RequirePermission('performance:finalize')
  resolveProbation(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: ResolveProbationDto,
  ) {
    return this.service.resolveProbation(actor, id, dto);
  }

  @Get('employees/:employeeId/probation')
  @RequirePermission('performance:read')
  listProbations(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string) {
    return this.service.listProbationsForEmployee(actor, employeeId);
  }

  @Get('probation/pending')
  @RequirePermission('performance:read')
  listPending(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.service.listPendingProbationReviews(actor, companyId);
  }

  @Get('probation/dashboard')
  @RequirePermission('performance:read')
  probationDashboard(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.service.getProbationDashboard(actor, companyId);
  }
}
