// ============================================================================
// modules/workforce-risk/interface/http/workforce-risk.controller.ts
// ============================================================================

import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { WorkforceRiskService } from '../../application/workforce-risk.service';
import {
  CreateStaffingRuleInput,
  WorkforceStaffingRuleService,
} from '../../application/workforce-staffing-rule.service';

@Controller()
export class WorkforceRiskController {
  constructor(
    private readonly risk: WorkforceRiskService,
    private readonly rules: WorkforceStaffingRuleService,
  ) {}

  @Get('companies/:companyId/workforce-risk')
  @RequirePermission('attendance:read')
  getCompanyRisk(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('date') date?: string,
  ) {
    return this.risk.getCompanyRisk(actor, companyId, date);
  }

  @Get('companies/:companyId/workforce-risk/forecast')
  @RequirePermission('attendance:read')
  getForecast(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query('startDate') startDate: string,
    @Query('days') days?: string,
  ) {
    return this.risk.getRiskForecast(
      actor,
      companyId,
      startDate,
      days ? Number(days) : 7,
    );
  }

  @Get('companies/:companyId/workforce-staffing-rules')
  @RequirePermission('attendance:read')
  listRules(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
  ) {
    return this.rules.list(actor, companyId);
  }

  @Post('companies/:companyId/workforce-staffing-rules')
  @RequirePermission('attendance:write')
  createRule(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Body() body: Omit<CreateStaffingRuleInput, 'companyId'>,
  ) {
    return this.rules.create(actor, { ...body, companyId });
  }
}
