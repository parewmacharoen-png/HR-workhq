// ============================================================================
// modules/kpi/interface/http/kpi.controller.ts
// KPI-001
// ============================================================================

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { KpiTemplateService } from '../../application/kpi-template.service';
import { KpiCycleService } from '../../application/kpi-cycle.service';
import { KpiAssignmentService } from '../../application/kpi-assignment.service';
import { KpiDashboardService } from '../../application/kpi-dashboard.service';
import { KpiPositionRuleService } from '../../application/kpi-position-rule.service';
import {
  AssignKpiCycleDto,
  CreateKpiCycleDto,
  CreateKpiPositionRuleDto,
  CreateKpiTemplateDto,
  UpdateKpiPositionRuleDto,
  UpdateKpiScoresDto,
  UpdateKpiTemplateDto,
} from '../../application/dto/kpi.dto';

@Controller()
export class KpiController {
  constructor(
    private readonly templates: KpiTemplateService,
    private readonly cycles: KpiCycleService,
    private readonly assignments: KpiAssignmentService,
    private readonly dashboard: KpiDashboardService,
    private readonly positionRules: KpiPositionRuleService,
  ) {}

  @Post('kpi/templates')
  @RequirePermission('performance:write')
  createTemplate(@CurrentActor() actor: ActorContext, @Body() dto: CreateKpiTemplateDto) {
    return this.templates.create(actor, dto);
  }

  @Get('kpi/templates')
  @RequirePermission('performance:read')
  listTemplates(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.templates.list(actor, companyId);
  }

  @Patch('kpi/templates/:id')
  @RequirePermission('performance:write')
  updateTemplate(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateKpiTemplateDto,
  ) {
    return this.templates.update(actor, id, dto);
  }

  @Post('kpi/templates/:id/clone')
  @RequirePermission('performance:write')
  cloneTemplate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.templates.clone(actor, id);
  }

  @Post('kpi/templates/:id/archive')
  @RequirePermission('performance:write')
  archiveTemplate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.templates.archive(actor, id);
  }

  @Delete('kpi/templates/:id')
  @RequirePermission('performance:write')
  deleteTemplate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.templates.delete(actor, id);
  }

  @Post('kpi/templates/:id/version')
  @RequirePermission('performance:write')
  createTemplateVersion(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.templates.createVersion(actor, id);
  }

  @Get('kpi/templates/by-position')
  @RequirePermission('performance:read')
  listTemplatesByPosition(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('positionDefinitionId') positionDefinitionId: string,
  ) {
    return this.templates.findByPosition(actor, companyId, positionDefinitionId);
  }

  @Post('kpi/cycles')
  @RequirePermission('performance:write')
  createCycle(@CurrentActor() actor: ActorContext, @Body() dto: CreateKpiCycleDto) {
    return this.cycles.create(actor, dto);
  }

  @Get('kpi/cycles')
  @RequirePermission('performance:read')
  listCycles(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.cycles.list(actor, companyId);
  }

  @Post('kpi/cycles/:id/assign')
  @RequirePermission('performance:write')
  assignCycle(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AssignKpiCycleDto,
  ) {
    return this.cycles.assign(actor, id, dto);
  }

  @Get('kpi/cycles/:id/assignments')
  @RequirePermission('performance:read')
  listCycleAssignments(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
  ) {
    return this.cycles.listAssignments(actor, id);
  }

  @Get('kpi/dashboard')
  @RequirePermission('performance:read')
  getDashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.dashboard.getDashboard(actor, companyId);
  }

  @Get('kpi/dashboard/position-rules')
  @RequirePermission('performance:read')
  getPositionRulesDashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.positionRules.getPositionRulesDashboard(actor, companyId);
  }

  @Post('kpi/position-rules')
  @RequirePermission('performance:write')
  createPositionRule(
    @CurrentActor() actor: ActorContext,
    @Body() dto: CreateKpiPositionRuleDto,
  ) {
    return this.positionRules.create(actor, dto);
  }

  @Get('kpi/position-rules')
  @RequirePermission('performance:read')
  listPositionRules(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.positionRules.list(actor, companyId);
  }

  @Patch('kpi/position-rules/:id')
  @RequirePermission('performance:write')
  updatePositionRule(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateKpiPositionRuleDto,
  ) {
    return this.positionRules.update(actor, id, dto);
  }

  @Delete('kpi/position-rules/:id')
  @RequirePermission('performance:write')
  deletePositionRule(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.positionRules.delete(actor, id);
  }

  @Get('employees/:id/kpi')
  @RequirePermission('performance:read')
  getEmployeeKpi(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.assignments.getEmployeeKpi(actor, employeeId, companyId);
  }

  @Patch('kpi/assignments/:id/scores')
  @RequirePermission('performance:write')
  updateScores(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateKpiScoresDto,
  ) {
    return this.assignments.updateScores(actor, id, dto);
  }

  @Post('kpi/assignments/:id/submit')
  @RequirePermission('performance:write')
  submitAssignment(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.assignments.submit(actor, id);
  }

  @Post('kpi/assignments/:id/finalize')
  @RequirePermission('performance:finalize')
  finalizeAssignment(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.assignments.finalize(actor, id);
  }
}
