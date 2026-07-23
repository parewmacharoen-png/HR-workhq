// ============================================================================
// modules/commission/interface/http/admin-commission.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { IsOptional, IsUUID } from 'class-validator';
import { AdminCommissionService } from '../../application/admin-commission.service';
import { AdminCommissionQueryService } from '../../application/admin-commission-query.service';
import { CalculateAdminCommissionDto } from '../../application/dto/admin-commission.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

class SummaryQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
}

@Controller('commission/admin')
export class AdminCommissionController {
  constructor(
    private readonly service: AdminCommissionService,
    private readonly query: AdminCommissionQueryService,
  ) {}

  @Post('calculate')
  @RequirePermission('commission:write')
  calculate(@CurrentActor() actor: ActorContext, @Body() dto: CalculateAdminCommissionDto) {
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
