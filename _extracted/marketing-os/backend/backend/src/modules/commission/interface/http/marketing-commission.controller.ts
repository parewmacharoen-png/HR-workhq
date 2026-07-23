// ============================================================================
// modules/commission/interface/http/marketing-commission.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { MarketingCommissionService } from '../../application/marketing-commission.service';
import { MarketingCommissionQueryService } from '../../application/marketing-commission-query.service';
import { CalculateMarketingCommissionDto } from '../../application/dto/marketing-commission.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class SummaryQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
}

@Controller('commission/marketing')
export class MarketingCommissionController {
  constructor(
    private readonly service: MarketingCommissionService,
    private readonly query: MarketingCommissionQueryService,
  ) {}

  @Post('calculate')
  @RequirePermission('commission:write')
  calculate(@CurrentActor() actor: ActorContext, @Body() dto: CalculateMarketingCommissionDto) {
    return this.service.calculate(actor, dto);
  }

  @Post(':cycleId/finalize')
  @RequirePermission('commission:write')
  finalize(@CurrentActor() actor: ActorContext, @Param('cycleId') cycleId: string) {
    return this.service.finalize(actor, cycleId);
  }

  @Get('summary')
  @RequirePermission('commission:read')
  summary(@CurrentActor() actor: ActorContext, @Query() q: SummaryQuery) {
    return this.query.getCompanySummary(actor, q.companyId, q.earnCycleId);
  }
}
