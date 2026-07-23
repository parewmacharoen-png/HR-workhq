import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { CompetencyService } from '../../application/competency.service';

@Controller()
export class CompetencyController {
  constructor(private readonly competencies: CompetencyService) {}

  @Get('hr/competencies')
  @RequirePermission('employee:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
  ) {
    return this.competencies.list(actor, companyId, status);
  }

  @Post('hr/competencies')
  @RequirePermission('employee:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: {
    companyId?: string;
    name: string;
    description?: string;
    category?: string;
    levels?: Array<{ level: number; label: string; description?: string }>;
  }) {
    return this.competencies.create(actor, dto);
  }

  @Get('hr/competencies/:id')
  @RequirePermission('employee:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.competencies.get(actor, id);
  }

  @Patch('hr/competencies/:id')
  @RequirePermission('employee:write')
  update(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: Partial<{ name: string; description: string; category: string }>) {
    return this.competencies.update(actor, id, dto);
  }

  @Post('hr/competencies/:id/archive')
  @RequirePermission('employee:write')
  archive(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.competencies.archive(actor, id);
  }

  @Post('hr/employees/:employeeId/competencies')
  @RequirePermission('employee:write')
  assign(
    @CurrentActor() actor: ActorContext,
    @Param('employeeId') employeeId: string,
    @Body() dto: {
      competencyId: string;
      currentLevel: number;
      targetLevel?: number;
      notes?: string;
      evidenceJson?: Record<string, unknown>;
    },
  ) {
    return this.competencies.assignToEmployee(actor, employeeId, dto);
  }

  @Get('hr/employees/:employeeId/competencies')
  @RequirePermission('employee:read')
  employeeMatrix(@CurrentActor() actor: ActorContext, @Param('employeeId') employeeId: string) {
    return this.competencies.employeeMatrix(actor, employeeId);
  }

  @Post('hr/positions/:positionId/competency-requirements')
  @RequirePermission('employee:write')
  positionRequirement(
    @CurrentActor() actor: ActorContext,
    @Param('positionId') positionId: string,
    @Body() dto: { competencyId: string; requiredLevel: number; importance?: 'required' | 'preferred' | 'optional' },
  ) {
    return this.competencies.setPositionRequirement(actor, positionId, dto);
  }

  @Get('hr/competencies/gap-analysis')
  @RequirePermission('employee:read')
  gapAnalysis(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('teamId') teamId?: string,
  ) {
    return this.competencies.gapAnalysisByTeam(actor, companyId, teamId);
  }
}
