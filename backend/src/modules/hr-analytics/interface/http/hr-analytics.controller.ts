// ============================================================================
// modules/hr-analytics/interface/http/hr-analytics.controller.ts
// ============================================================================

import { Controller, Get, Header, Query } from '@nestjs/common';
import { HrAnalyticsService } from '../../application/hr-analytics.service';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('analytics/hr')
export class HrAnalyticsController {
  constructor(private readonly service: HrAnalyticsService) {}

  @Get('dashboard')
  @RequirePermission('reporting:read')
  dashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.service.getDashboard(actor, companyId, teamId);
  }

  @Get('export')
  @RequirePermission('reporting:read')
  @Header('Content-Type', 'text/csv')
  async exportCsv(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.service.exportCsv(actor, companyId);
  }
}
