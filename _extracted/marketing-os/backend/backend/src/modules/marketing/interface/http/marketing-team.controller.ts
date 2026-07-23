// ============================================================================
// modules/marketing/interface/http/marketing-team.controller.ts
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { MarketingTeamService } from '../../application/marketing-team.service';
import {
  AddMarketingTeamMemberDto,
  AssignMarketingLeaderDto,
  CreateMarketingTeamDto,
  ListMarketingTeamsQuery,
  TransferMarketingTeamMemberDto,
  UpdateMarketingTeamDto,
} from '../../application/dto/marketing-team.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';

@Controller('marketing/teams')
export class MarketingTeamController {
  constructor(private readonly service: MarketingTeamService) {}

  @Get()
  @RequirePermission('marketing:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListMarketingTeamsQuery) {
    return this.service.listTeams(actor, query.companyId);
  }

  @Get('tree')
  @RequirePermission('marketing:read')
  tree(@CurrentActor() actor: ActorContext, @Query() query: ListMarketingTeamsQuery) {
    return this.service.getTeamTree(actor, query.companyId);
  }

  @Get('employees/:employeeId/history')
  @RequirePermission('marketing:read')
  membershipHistory(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.getMembershipHistory(actor, companyId, employeeId);
  }

  @Get(':id')
  @RequirePermission('marketing:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getTeam(actor, id);
  }

  @Get(':id/members')
  @RequirePermission('marketing:read')
  members(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Query('asOf') asOf?: string,
  ) {
    return this.service.getActiveTeamMembers(actor, id, asOf);
  }

  @Post()
  @RequirePermission('marketing:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateMarketingTeamDto) {
    return this.service.createTeam(actor, dto);
  }

  @Patch(':id')
  @RequirePermission('marketing:write')
  patch(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateMarketingTeamDto,
  ) {
    return this.service.updateTeam(actor, id, dto);
  }

  @Post(':id/deactivate')
  @RequirePermission('marketing:write')
  deactivate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.deactivateTeam(actor, id);
  }

  @Post(':id/big-leader')
  @RequirePermission('marketing:write')
  assignBigLeader(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AssignMarketingLeaderDto,
  ) {
    return this.service.assignBigLeader(actor, id, dto.employeeId);
  }

  @Post(':id/sub-leader')
  @RequirePermission('marketing:write')
  assignSubLeader(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AssignMarketingLeaderDto,
  ) {
    return this.service.assignSubLeader(actor, id, dto.employeeId);
  }

  @Post(':id/members')
  @RequirePermission('marketing:write')
  addMember(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AddMarketingTeamMemberDto,
  ) {
    return this.service.addMember(actor, id, dto);
  }

  @Post(':id/members/:employeeId/transfer')
  @RequirePermission('marketing:write')
  transferMember(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
    @Body() dto: TransferMarketingTeamMemberDto,
  ) {
    return this.service.transferMember(actor, id, employeeId, dto);
  }

  @Delete(':id/members/:employeeId')
  @RequirePermission('marketing:write')
  removeMember(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.removeMember(actor, id, employeeId);
  }
}
