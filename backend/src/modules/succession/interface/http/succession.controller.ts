import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { SuccessionReadiness } from '@prisma/client';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { SuccessionService } from '../../application/succession.service';

@Controller()
export class SuccessionController {
  constructor(private readonly succession: SuccessionService) {}

  @Get('hr/succession/critical-roles')
  @RequirePermission('employee:read')
  listRoles(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.succession.listCriticalRoles(actor, companyId);
  }

  @Post('hr/succession/critical-roles')
  @RequirePermission('employee:write')
  createRole(@CurrentActor() actor: ActorContext, @Body() dto: {
    companyId: string;
    name: string;
    description?: string;
    riskLevel?: string;
    positionDefinitionId?: string;
    currentHolderEmployeeId?: string;
  }) {
    return this.succession.createCriticalRole(actor, dto);
  }

  @Patch('hr/succession/critical-roles/:id')
  @RequirePermission('employee:write')
  updateRole(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: Record<string, unknown>) {
    return this.succession.updateCriticalRole(actor, id, dto as never);
  }

  @Post('hr/succession/critical-roles/:id/candidates')
  @RequirePermission('employee:write')
  addCandidate(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: {
    employeeId: string;
    readiness?: SuccessionReadiness;
    strengthsJson?: Record<string, unknown>;
    gapsJson?: Record<string, unknown>;
    developmentPlan?: string;
  }) {
    return this.succession.addCandidate(actor, id, dto);
  }

  @Patch('hr/succession/candidates/:id/readiness')
  @RequirePermission('employee:write')
  updateReadiness(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() body: { readiness: SuccessionReadiness },
  ) {
    return this.succession.updateReadiness(actor, id, body.readiness);
  }

  @Get('hr/succession/plans')
  @RequirePermission('employee:read')
  listPlans(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.succession.listPlans(actor, companyId);
  }

  @Post('hr/succession/plans')
  @RequirePermission('employee:write')
  createPlan(@CurrentActor() actor: ActorContext, @Body() dto: {
    companyId: string;
    name: string;
    periodStart: string;
    periodEnd: string;
  }) {
    return this.succession.createPlan(actor, dto);
  }

  @Get('hr/succession/roles-without-backup')
  @RequirePermission('employee:read')
  noBackup(@CurrentActor() actor: ActorContext, @Query('companyId') companyId: string) {
    return this.succession.rolesWithoutBackup(actor, companyId);
  }
}
