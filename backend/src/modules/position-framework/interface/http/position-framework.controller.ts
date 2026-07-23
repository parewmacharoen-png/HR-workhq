// ============================================================================
// modules/position-framework/interface/http/position-framework.controller.ts
// KPI-004
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { PositionFamilyService } from '../../application/position-family.service';
import { PositionLevelService } from '../../application/position-level.service';
import { PositionDefinitionService } from '../../application/position-definition.service';
import { CareerPathService } from '../../application/career-path.service';
import { PromotionPathService } from '../../application/promotion-path.service';
import { EmployeePositionService } from '../../application/employee-position.service';
import { PromotionPathValidationService } from '../../application/promotion-path-validation.service';
import {
  CreateCareerPathDto,
  CreatePositionDefinitionDto,
  CreatePositionFamilyDto,
  CreatePositionLevelDto,
  CreatePromotionPathDto,
  UpdateCareerPathDto,
  UpdatePositionDefinitionDto,
  UpdatePositionFamilyDto,
  UpdatePositionLevelDto,
  UpdatePromotionPathDto,
} from '../../application/dto/position-framework.dto';

@Controller('position-framework')
export class PositionFrameworkController {
  constructor(
    private readonly families: PositionFamilyService,
    private readonly levels: PositionLevelService,
    private readonly positions: PositionDefinitionService,
    private readonly careerPaths: CareerPathService,
    private readonly promotionPaths: PromotionPathService,
    private readonly employeePositions: EmployeePositionService,
    private readonly promotionValidation: PromotionPathValidationService,
  ) {}

  // ── Families ──────────────────────────────────────────────────────────────

  @Post('families')
  @RequirePermission('performance:write')
  createFamily(@CurrentActor() actor: ActorContext, @Body() dto: CreatePositionFamilyDto) {
    return this.families.create(actor, dto);
  }

  @Get('families')
  @RequirePermission('performance:read')
  listFamilies(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.families.list(actor, companyId);
  }

  @Patch('families/:id')
  @RequirePermission('performance:write')
  updateFamily(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdatePositionFamilyDto,
  ) {
    return this.families.update(actor, id, dto);
  }

  @Delete('families/:id')
  @RequirePermission('performance:write')
  deleteFamily(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.families.softDelete(actor, id);
  }

  @Post('families/:id/archive')
  @RequirePermission('performance:write')
  archiveFamily(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.families.archive(actor, id);
  }

  @Post('families/:id/clone')
  @RequirePermission('performance:write')
  cloneFamily(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.families.clone(actor, id);
  }

  @Post('families/:id/version')
  @RequirePermission('performance:write')
  versionFamily(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.families.newVersion(actor, id);
  }

  // ── Levels ────────────────────────────────────────────────────────────────

  @Post('levels')
  @RequirePermission('performance:write')
  createLevel(@CurrentActor() actor: ActorContext, @Body() dto: CreatePositionLevelDto) {
    return this.levels.create(actor, dto);
  }

  @Get('levels')
  @RequirePermission('performance:read')
  listLevels(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.levels.list(actor, companyId);
  }

  @Patch('levels/:id')
  @RequirePermission('performance:write')
  updateLevel(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdatePositionLevelDto,
  ) {
    return this.levels.update(actor, id, dto);
  }

  @Delete('levels/:id')
  @RequirePermission('performance:write')
  deleteLevel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.levels.softDelete(actor, id);
  }

  @Post('levels/:id/archive')
  @RequirePermission('performance:write')
  archiveLevel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.levels.archive(actor, id);
  }

  @Post('levels/:id/clone')
  @RequirePermission('performance:write')
  cloneLevel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.levels.clone(actor, id);
  }

  @Post('levels/:id/version')
  @RequirePermission('performance:write')
  versionLevel(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.levels.newVersion(actor, id);
  }

  // ── Positions ─────────────────────────────────────────────────────────────

  @Post('positions')
  @RequirePermission('performance:write')
  createPosition(@CurrentActor() actor: ActorContext, @Body() dto: CreatePositionDefinitionDto) {
    return this.positions.create(actor, dto);
  }

  @Get('positions')
  @RequirePermission('performance:read')
  listPositions(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.positions.list(actor, companyId);
  }

  @Patch('positions/:id')
  @RequirePermission('performance:write')
  updatePosition(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdatePositionDefinitionDto,
  ) {
    return this.positions.update(actor, id, dto);
  }

  @Delete('positions/:id')
  @RequirePermission('performance:write')
  deletePosition(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.positions.softDelete(actor, id);
  }

  @Post('positions/:id/archive')
  @RequirePermission('performance:write')
  archivePosition(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.positions.archive(actor, id);
  }

  @Post('positions/:id/clone')
  @RequirePermission('performance:write')
  clonePosition(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.positions.clone(actor, id);
  }

  @Post('positions/:id/version')
  @RequirePermission('performance:write')
  versionPosition(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.positions.newVersion(actor, id);
  }

  // ── Career paths ──────────────────────────────────────────────────────────

  @Post('career-paths')
  @RequirePermission('performance:write')
  createCareerPath(@CurrentActor() actor: ActorContext, @Body() dto: CreateCareerPathDto) {
    return this.careerPaths.create(actor, dto);
  }

  @Get('career-paths')
  @RequirePermission('performance:read')
  listCareerPaths(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.careerPaths.list(actor, companyId);
  }

  @Patch('career-paths/:id')
  @RequirePermission('performance:write')
  updateCareerPath(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateCareerPathDto,
  ) {
    return this.careerPaths.update(actor, id, dto);
  }

  @Delete('career-paths/:id')
  @RequirePermission('performance:write')
  deleteCareerPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.careerPaths.softDelete(actor, id);
  }

  @Post('career-paths/:id/archive')
  @RequirePermission('performance:write')
  archiveCareerPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.careerPaths.archive(actor, id);
  }

  @Post('career-paths/:id/clone')
  @RequirePermission('performance:write')
  cloneCareerPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.careerPaths.clone(actor, id);
  }

  @Post('career-paths/:id/version')
  @RequirePermission('performance:write')
  versionCareerPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.careerPaths.newVersion(actor, id);
  }

  // ── Promotion paths ───────────────────────────────────────────────────────

  @Post('promotion-paths')
  @RequirePermission('performance:write')
  createPromotionPath(@CurrentActor() actor: ActorContext, @Body() dto: CreatePromotionPathDto) {
    return this.promotionPaths.create(actor, dto);
  }

  @Get('promotion-paths')
  @RequirePermission('performance:read')
  listPromotionPaths(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.promotionPaths.list(actor, companyId);
  }

  @Patch('promotion-paths/:id')
  @RequirePermission('performance:write')
  updatePromotionPath(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdatePromotionPathDto,
  ) {
    return this.promotionPaths.update(actor, id, dto);
  }

  @Delete('promotion-paths/:id')
  @RequirePermission('performance:write')
  deletePromotionPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionPaths.softDelete(actor, id);
  }

  @Post('promotion-paths/:id/archive')
  @RequirePermission('performance:write')
  archivePromotionPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionPaths.archive(actor, id);
  }

  @Post('promotion-paths/:id/clone')
  @RequirePermission('performance:write')
  clonePromotionPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionPaths.clone(actor, id);
  }

  @Post('promotion-paths/:id/version')
  @RequirePermission('performance:write')
  versionPromotionPath(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.promotionPaths.newVersion(actor, id);
  }

  // ── Employee position assignments ─────────────────────────────────────────

  @Get('assignments/missing')
  @RequirePermission('performance:read')
  listMissingAssignments(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.employeePositions.listMissingAssignments(actor, companyId);
  }

  @Get('dashboard/missing-assignments')
  @RequirePermission('performance:read')
  getMissingAssignmentsDashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.employeePositions.getMissingAssignmentsDashboard(actor, companyId);
  }

  @Get('promotion-paths/validate')
  @RequirePermission('performance:read')
  validatePromotionPath(
    @CurrentActor() actor: ActorContext,
    @Query('employeeId') employeeId: string,
    @Query('companyId') companyId: string,
    @Query('targetPositionDefinitionId') targetPositionDefinitionId: string,
  ) {
    return this.promotionValidation.validate(actor, {
      employeeId,
      companyId,
      targetPositionDefinitionId,
    });
  }
}
