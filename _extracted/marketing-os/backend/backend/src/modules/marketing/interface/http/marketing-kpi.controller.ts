// ============================================================================
// modules/marketing/interface/http/marketing-kpi.controller.ts
// ============================================================================

import { Controller, Get, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { MarketingKpiQueryService } from '../../application/marketing-kpi-query.service';
import { MarketingBackOfficeService } from '../../application/marketing-backoffice.service';
import { KpiReviewQuery } from '../../application/dto/marketing-backoffice.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class MyKpiQuery {
  @IsOptional() @IsUUID() earnCycleId?: string;
}

class TeamKpiQuery {
  @IsUUID() companyId!: string;
  @IsUUID() teamId!: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
}

class CompanyKpiQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
}

@Controller('marketing/kpi')
export class MarketingKpiController {
  constructor(
    private readonly kpi: MarketingKpiQueryService,
    private readonly backOffice: MarketingBackOfficeService,
  ) {}

  @Get('me')
  @RequirePermission('marketing:read')
  myKpi(@CurrentActor() actor: ActorContext, @Query() q: MyKpiQuery) {
    return this.kpi.getMyKpi(actor, q.earnCycleId);
  }

  @Get('team')
  @RequirePermission('marketing:read')
  teamKpi(@CurrentActor() actor: ActorContext, @Query() q: TeamKpiQuery) {
    return this.kpi.getTeamKpi(actor, q.companyId, q.teamId, q.earnCycleId);
  }

  @Get('company')
  @RequirePermission('marketing:read')
  companyKpi(@CurrentActor() actor: ActorContext, @Query() q: CompanyKpiQuery) {
    return this.kpi.getCompanyKpi(actor, q.companyId, q.earnCycleId);
  }

  @Get('review')
  @RequirePermission('marketing:read')
  review(@CurrentActor() actor: ActorContext, @Query() q: KpiReviewQuery) {
    return this.backOffice.getKpiReview(actor, q);
  }
}
