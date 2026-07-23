import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { KnowledgeGraphService } from '../../application/knowledge-graph.service';

@Controller()
export class KnowledgeGraphController {
  constructor(private readonly graph: KnowledgeGraphService) {}

  @Post('ai/graph/query')
  @RequirePermission('employee:read')
  query(
    @CurrentActor() actor: ActorContext,
    @Body() body: { companyId: string; query: string },
  ) {
    return this.graph.query(actor, body.companyId, body.query);
  }

  @Get('ai/graph/employee/:id/context')
  @RequirePermission('employee:read')
  employeeContext(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.graph.employeeContext(actor, id);
  }

  @Get('ai/graph/team/:id/summary')
  @RequirePermission('employee:read')
  teamSummary(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Query('companyId') companyId: string,
  ) {
    return this.graph.teamSummary(actor, id, companyId);
  }

  @Get('ai/graph/company/:id/summary')
  @RequirePermission('employee:read')
  companySummary(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.graph.companySummary(actor, id);
  }
}
