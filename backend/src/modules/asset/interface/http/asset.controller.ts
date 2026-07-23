// ============================================================================
// modules/asset/interface/http/asset.controller.ts
// ============================================================================

import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission, RequireAnyPermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { AssetService } from '../../application/asset.service';
import {
  AssignAssetDto,
  BorrowAssetDto,
  CreateAssetDto,
  ListAssetsQuery,
  ReportDamageDto,
  ReturnAssetDto,
  UpdateAssetDto,
} from '../../application/dto/asset.dto';

@Controller('assets')
export class AssetController {
  constructor(private readonly service: AssetService) {}

  @Post('companies/:companyId')
  @RequireAnyPermission('asset:write', 'employee:write')
  create(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Body() dto: CreateAssetDto,
  ) {
    return this.service.create(actor, companyId, dto);
  }

  @Get('companies/:companyId')
  @RequireAnyPermission('asset:read', 'employee:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Query() query: ListAssetsQuery,
  ) {
    return this.service.list(actor, companyId, query);
  }

  @Get('companies/:companyId/borrow-summary')
  @RequireAnyPermission('asset:read', 'employee:read')
  borrowSummary(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
  ) {
    return this.service.borrowSummary(actor, companyId);
  }

  @Post('companies/:companyId/borrow')
  @RequireAnyPermission('asset:write', 'employee:write')
  borrow(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Body() dto: BorrowAssetDto,
  ) {
    return this.service.borrowToEmployee(actor, companyId, dto);
  }

  @Get('companies/:companyId/employees/:employeeId')
  @RequireAnyPermission('asset:read', 'employee:read')
  listEmployeeAssets(
    @CurrentActor() actor: ActorContext,
    @Param('companyId') companyId: string,
    @Param('employeeId') employeeId: string,
  ) {
    return this.service.listEmployeeAssets(actor, employeeId, companyId);
  }

  @Get(':id')
  @RequireAnyPermission('asset:read', 'employee:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.get(actor, id);
  }

  @Patch(':id')
  @RequireAnyPermission('asset:write', 'employee:write')
  update(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateAssetDto,
  ) {
    return this.service.update(actor, id, dto);
  }

  @Delete(':id')
  @RequireAnyPermission('asset:write', 'employee:write')
  remove(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.remove(actor, id);
  }

  @Post(':id/assign')
  @RequireAnyPermission('asset:write', 'employee:write')
  assign(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AssignAssetDto,
  ) {
    return this.service.assign(actor, id, dto);
  }

  @Post(':id/return')
  @RequireAnyPermission('asset:write', 'employee:write')
  returnAsset(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: ReturnAssetDto,
  ) {
    return this.service.returnAsset(actor, id, dto);
  }

  @Post(':id/damage-reports')
  @RequireAnyPermission('asset:write', 'employee:write')
  reportDamage(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: ReportDamageDto,
  ) {
    return this.service.reportDamage(actor, id, dto);
  }

  @Post('damage-reports/:reportId/resolve')
  @RequireAnyPermission('asset:write', 'employee:write')
  resolveDamage(
    @CurrentActor() actor: ActorContext,
    @Param('reportId') reportId: string,
  ) {
    return this.service.resolveDamage(actor, reportId);
  }

  @Get(':id/assignments')
  @RequireAnyPermission('asset:read', 'employee:read')
  listAssignments(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listAssignments(actor, id);
  }

  @Get(':id/damage-reports')
  @RequireAnyPermission('asset:read', 'employee:read')
  listDamageReports(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.listDamageReports(actor, id);
  }

  @Get(':id/history')
  @RequireAnyPermission('asset:read', 'employee:read')
  history(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.service.getHistory(actor, id);
  }
}
