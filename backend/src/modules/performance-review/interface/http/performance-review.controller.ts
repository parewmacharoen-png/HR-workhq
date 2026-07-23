// ============================================================================
// modules/performance-review/interface/http/performance-review.controller.ts
// KPI-003
// ============================================================================

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { PerformanceWeightProfileService } from '../../application/performance-weight-profile.service';
import { PerformanceReviewCycleService } from '../../application/performance-review-cycle.service';
import { PerformanceReviewService } from '../../application/performance-review.service';
import { PerformanceDashboardService } from '../../application/performance-dashboard.service';
import {
  AddPerformance360FeedbackDto,
  AssignPerformanceReviewCycleDto,
  CreatePerformanceReviewCycleDto,
  CreatePerformanceWeightProfileDto,
  UpdatePerformanceReviewScoresDto,
  UpdatePerformanceWeightProfileDto,
} from '../../application/dto/performance-review.dto';

@Controller()
export class PerformanceReviewController {
  constructor(
    private readonly weightProfiles: PerformanceWeightProfileService,
    private readonly cycles: PerformanceReviewCycleService,
    private readonly reviews: PerformanceReviewService,
    private readonly dashboard: PerformanceDashboardService,
  ) {}

  @Post('performance/weight-profiles')
  @RequirePermission('performance:write')
  createWeightProfile(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePerformanceWeightProfileDto,
  ) {
    return this.weightProfiles.create(actor, dto);
  }

  @Get('performance/weight-profiles')
  @RequirePermission('performance:read')
  listWeightProfiles(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.weightProfiles.list(actor, companyId);
  }

  @Patch('performance/weight-profiles/:id')
  @RequirePermission('performance:write')
  updateWeightProfile(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdatePerformanceWeightProfileDto,
  ) {
    return this.weightProfiles.update(actor, id, dto);
  }

  @Post('performance/weight-profiles/:id/clone')
  @RequirePermission('performance:write')
  cloneWeightProfile(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.weightProfiles.clone(actor, id);
  }

  @Post('performance/weight-profiles/:id/archive')
  @RequirePermission('performance:write')
  archiveWeightProfile(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.weightProfiles.archive(actor, id);
  }

  @Delete('performance/weight-profiles/:id')
  @RequirePermission('performance:write')
  deleteWeightProfile(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.weightProfiles.delete(actor, id);
  }

  @Post('performance/weight-profiles/:id/version')
  @RequirePermission('performance:write')
  createWeightProfileVersion(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.weightProfiles.createVersion(actor, id);
  }

  @Post('performance/review-cycles')
  @RequirePermission('performance:write')
  createReviewCycle(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreatePerformanceReviewCycleDto,
  ) {
    return this.cycles.create(actor, dto);
  }

  @Get('performance/review-cycles')
  @RequirePermission('performance:read')
  listReviewCycles(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.cycles.list(actor, companyId);
  }

  @Post('performance/review-cycles/:id/assign')
  @RequirePermission('performance:write')
  assignReviewCycle(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AssignPerformanceReviewCycleDto,
  ) {
    return this.cycles.assign(actor, id, dto);
  }

  @Get('performance/review-cycles/:id/reviews')
  @RequirePermission('performance:read')
  listCycleReviews(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.cycles.listReviews(actor, id);
  }

  @Get('employees/:id/performance-reviews')
  @RequirePermission('performance:read')
  getEmployeeReviews(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.reviews.getEmployeeReviews(actor, employeeId, companyId);
  }

  @Patch('performance/reviews/:id/scores')
  @RequirePermission('performance:write')
  updateReviewScores(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdatePerformanceReviewScoresDto,
  ) {
    return this.reviews.updateScores(actor, id, dto);
  }

  @Post('performance/reviews/:id/360-feedback')
  @RequirePermission('performance:write')
  add360Feedback(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AddPerformance360FeedbackDto,
  ) {
    return this.reviews.add360Feedback(actor, id, dto);
  }

  @Post('performance/reviews/:id/submit')
  @RequirePermission('performance:write')
  submitReview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.reviews.submit(actor, id);
  }

  @Post('performance/reviews/:id/finalize')
  @RequirePermission('performance:finalize')
  finalizeReview(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.reviews.finalize(actor, id);
  }

  @Get('performance/dashboard')
  @RequirePermission('performance:read')
  getDashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.dashboard.getDashboard(actor, companyId);
  }
}
