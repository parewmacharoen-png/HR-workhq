// ============================================================================
// modules/marketing/interface/http/marketing-insight.controller.ts
// Read-only marketing insights for web back office.
// ============================================================================

import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { MarketingInsightService } from '../../application/marketing-insight.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class MarketingInsightQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
  @IsOptional() @IsUUID() teamId?: string;
}

@Controller('marketing/insights')
export class MarketingInsightController {
  constructor(private readonly insights: MarketingInsightService) {}

  @Get()
  @RequirePermission('marketing:read')
  getInsights(@CurrentActor() actor: ActorContext, @Query() query: MarketingInsightQuery) {
    return this.insights.getPerformanceInsights(actor, query);
  }

  @Get('alerts')
  @RequirePermission('marketing:read')
  getAlerts(@CurrentActor() actor: ActorContext, @Query() query: MarketingInsightQuery) {
    return this.insights.getRiskAlerts(actor, query);
  }

  @Get('forecast')
  @RequirePermission('marketing:read')
  getForecast(@CurrentActor() actor: ActorContext, @Query() query: MarketingInsightQuery) {
    return this.insights.getForecast(actor, query);
  }

  @Get('teams')
  @RequirePermission('marketing:read')
  getTeamComparison(@CurrentActor() actor: ActorContext, @Query() query: MarketingInsightQuery) {
    return this.insights.getTeamComparison(actor, query);
  }
}
