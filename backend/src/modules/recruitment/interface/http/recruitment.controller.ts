// ============================================================================
// modules/recruitment/interface/http/recruitment.controller.ts
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { RecruitmentService } from '../../application/recruitment.service';
import {
  CreateCandidateDto, UpdateCandidateDto, MovePipelineDto,
  CreateInterviewDto, ResolveInterviewDto,
  CreateOfferDto, OfferResponseDto, AnalyticsQuery,
} from '../../application/dto/recruitment.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('recruitment')
export class RecruitmentController {
  constructor(private readonly service: RecruitmentService) {}

  // ── Candidates ─────────────────────────────────────────────────────────────
  @Post('candidates')
  @RequirePermission('recruitment:write')
  createCandidate(@CurrentActor() actor: ActorContext, @Body() dto: CreateCandidateDto) {
    return this.service.createCandidate(actor, dto);
  }

  @Get('candidates/:id')
  @RequirePermission('recruitment:read')
  getCandidate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getCandidate(actor, id);
  }

  @Patch('candidates/:id')
  @RequirePermission('recruitment:write')
  updateCandidate(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: UpdateCandidateDto) {
    return this.service.updateCandidate(actor, id, dto);
  }

  @Delete('candidates/:id')
  @RequirePermission('recruitment:write')
  deleteCandidate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.deleteCandidate(actor, id);
  }

  @Get('companies/:companyId/candidates')
  @RequirePermission('recruitment:read')
  listCandidates(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('stage') stage?: string,
    @Query('source') source?: string,
    @Query('recruiterEmployeeId') recruiterEmployeeId?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.service.listCandidates(actor, companyId, {
      stage, source, recruiterEmployeeId, from, to,
      limit: limit ? +limit : undefined,
      offset: offset ? +offset : undefined,
    });
  }

  // ── Pipeline ───────────────────────────────────────────────────────────────
  @Post('candidates/:id/pipeline')
  @RequirePermission('recruitment:write')
  movePipeline(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: MovePipelineDto) {
    return this.service.movePipeline(actor, id, dto);
  }

  @Get('candidates/:id/pipeline-history')
  @RequirePermission('recruitment:read')
  getPipelineHistory(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getPipelineHistory(actor, id);
  }

  // ── Interviews ─────────────────────────────────────────────────────────────
  @Post('interviews')
  @RequirePermission('recruitment:write')
  scheduleInterview(@CurrentActor() actor: ActorContext, @Body() dto: CreateInterviewDto) {
    return this.service.scheduleInterview(actor, dto);
  }

  @Patch('interviews/:id/resolve')
  @RequirePermission('recruitment:write')
  resolveInterview(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: ResolveInterviewDto) {
    return this.service.resolveInterview(actor, id, dto);
  }

  @Get('candidates/:id/interviews')
  @RequirePermission('recruitment:read')
  listInterviews(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listInterviews(actor, id);
  }

  // ── Offers ─────────────────────────────────────────────────────────────────
  @Post('offers')
  @RequirePermission('recruitment:write')
  createOffer(@CurrentActor() actor: ActorContext, @Body() dto: CreateOfferDto) {
    return this.service.createOffer(actor, dto);
  }

  @Post('offers/:id/send')
  @RequirePermission('recruitment:write')
  sendOffer(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.sendOffer(actor, id);
  }

  @Post('offers/:id/respond')
  @RequirePermission('recruitment:write')
  respondToOffer(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: OfferResponseDto) {
    return this.service.respondToOffer(actor, id, dto);
  }

  @Get('candidates/:id/offers')
  @RequirePermission('recruitment:read')
  listOffers(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listOffers(actor, id);
  }

  // ── Analytics ──────────────────────────────────────────────────────────────
  @Get('analytics/funnel')
  @RequirePermission('recruitment:read')
  getPipelineFunnel(@Query() q: AnalyticsQuery) {
    return this.service.getPipelineFunnel(q);
  }

  @Get('analytics/cost-per-hire')
  @RequirePermission('recruitment:read')
  getCostPerHire(@Query() q: AnalyticsQuery) {
    return this.service.getCostPerHire(q);
  }

  @Get('analytics/time-to-hire')
  @RequirePermission('recruitment:read')
  getTimeToHire(@Query() q: AnalyticsQuery) {
    return this.service.getTimeToHire(q);
  }

  @Get('analytics/recruiter-performance')
  @RequirePermission('recruitment:read')
  getRecruiterPerformance(@Query() q: AnalyticsQuery) {
    return this.service.getRecruiterPerformance(q);
  }

  @Get('analytics/source-breakdown')
  @RequirePermission('recruitment:read')
  getSourceBreakdown(@Query() q: AnalyticsQuery) {
    return this.service.getSourceBreakdown(q);
  }

  /** Commission integration endpoint: count unique candidates per recruiter per cycle. */
  @Get('recruiters/:employeeId/unique-count')
  @RequirePermission('commission:read')
  getUniqueCandidateCount(
    @Param('employeeId') employeeId: string,
    @Query('cycleId') cycleId: string,
  ) {
    return this.service.getUniqueCandidateCount(employeeId, cycleId);
  }
}
