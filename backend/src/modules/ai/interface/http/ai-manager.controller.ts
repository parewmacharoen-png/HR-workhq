import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { AiManagerService } from '../../application/ai-manager.service';

@Controller()
export class AiManagerController {
  constructor(private readonly manager: AiManagerService) {}

  @Get('ai/manager/dashboard')
  @RequirePermission('employee:read')
  dashboard(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.manager.dashboard(actor, companyId);
  }

  @Get('ai/manager/brief')
  @RequirePermission('employee:read')
  brief(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('employeeId') employeeId: string,
  ) {
    return this.manager.getTodayBrief(actor, companyId, employeeId);
  }

  @Get('ai/manager/brief/history')
  @RequirePermission('employee:read')
  briefHistory(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.manager.listBriefHistory(actor, companyId);
  }

  @Post('ai/manager/brief/regenerate')
  @RequirePermission('employee:write')
  regenerateBrief(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('employeeId') employeeId: string,
  ) {
    return this.manager.regenerateBrief(actor, companyId, employeeId);
  }

  @Get('ai/manager/insights')
  @RequirePermission('employee:read')
  insights(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('status') status?: string,
    @Query('severity') severity?: string,
  ) {
    return this.manager.listInsights(actor, companyId, status, severity);
  }

  @Post('ai/manager/insights/refresh')
  @RequirePermission('employee:write')
  refresh(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.manager.refreshInsights(actor, companyId);
  }

  @Patch('ai/manager/insights/:id/acknowledge')
  @RequirePermission('employee:write')
  acknowledge(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.manager.acknowledge(actor, id);
  }

  @Patch('ai/manager/insights/:id/dismiss')
  @RequirePermission('employee:write')
  dismiss(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.manager.dismiss(actor, id);
  }

  @Patch('ai/manager/insights/:id/resolve')
  @RequirePermission('employee:write')
  resolve(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.manager.resolve(actor, id);
  }
}
