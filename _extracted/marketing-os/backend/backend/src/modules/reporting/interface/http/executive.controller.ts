// ============================================================================
// reporting/interface/http/executive.controller.ts
// Read-only Executive Copilot HTTP API
// ============================================================================

import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { ExecutiveInsightService } from '../../application/executive-insight.service';
import { ExecutiveDailyBriefService } from '../../application/executive-daily-brief.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class ExecutiveQuery {
  @IsOptional() @IsUUID() companyId?: string;
}

@Controller('executive')
export class ExecutiveController {
  constructor(
    private readonly insights: ExecutiveInsightService,
    private readonly dailyBrief: ExecutiveDailyBriefService,
  ) {}

  @Get()
  @RequirePermission('reporting:executive')
  getSummary(@CurrentActor() actor: ActorContext, @Query() query: ExecutiveQuery) {
    return this.insights.getExecutiveSummary(actor, query);
  }

  @Get('risks')
  @RequirePermission('reporting:executive')
  getRisks(@CurrentActor() actor: ActorContext, @Query() query: ExecutiveQuery) {
    return this.insights.getExecutiveRisks(actor, query);
  }

  @Get('forecast')
  @RequirePermission('reporting:executive')
  getForecast(@CurrentActor() actor: ActorContext, @Query() query: ExecutiveQuery) {
    return this.insights.getExecutiveForecast(actor, query);
  }

  @Get('recommendations')
  @RequirePermission('reporting:executive')
  getRecommendations(@CurrentActor() actor: ActorContext, @Query() query: ExecutiveQuery) {
    return this.insights.getExecutiveRecommendations(actor, query);
  }

  @Get('brief')
  @RequirePermission('reporting:executive')
  getBrief(@CurrentActor() actor: ActorContext, @Query() query: ExecutiveQuery) {
    return this.dailyBrief.getDailyBrief(actor, query);
  }
}
