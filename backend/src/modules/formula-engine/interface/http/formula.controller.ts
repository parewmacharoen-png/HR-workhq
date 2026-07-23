import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { FormulaDefinitionService, CreateFormulaDto } from '../../application/formula-definition.service';

@Controller()
export class FormulaController {
  constructor(private readonly formulas: FormulaDefinitionService) {}

  @Get('formulas')
  @RequirePermission('settings:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('domain') domain?: string,
    @Query('status') status?: string,
  ) {
    return this.formulas.list(actor, companyId, domain, status);
  }

  @Post('formulas')
  @RequirePermission('settings:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateFormulaDto) {
    return this.formulas.create(actor, dto);
  }

  @Get('formulas/:id')
  @RequirePermission('settings:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.formulas.get(actor, id);
  }

  @Patch('formulas/:id')
  @RequirePermission('settings:write')
  update(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: Partial<CreateFormulaDto>) {
    return this.formulas.update(actor, id, dto);
  }

  @Post('formulas/:id/validate')
  @RequirePermission('settings:read')
  validate(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.formulas.validate(actor, id);
  }

  @Post('formulas/:id/test')
  @RequirePermission('settings:read')
  test(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() body: { inputs: Record<string, number> },
  ) {
    return this.formulas.test(actor, id, body.inputs ?? {});
  }

  @Post('formulas/:id/execute')
  @RequirePermission('settings:write')
  execute(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() body: { entityType: string; entityId: string; inputs: Record<string, number> },
  ) {
    return this.formulas.execute(actor, id, body.entityType, body.entityId, body.inputs ?? {});
  }

  @Post('formulas/:id/publish')
  @RequirePermission('settings:write')
  publish(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.formulas.publish(actor, id);
  }

  @Post('formulas/:id/archive')
  @RequirePermission('settings:write')
  archive(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.formulas.archive(actor, id);
  }

  @Post('formulas/:id/clone')
  @RequirePermission('settings:write')
  clone(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.formulas.clone(actor, id);
  }

  @Post('formulas/:id/version')
  @RequirePermission('settings:write')
  version(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.formulas.version(actor, id);
  }

  @Get('formulas/:id/history')
  @RequirePermission('settings:read')
  async history(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    const row = await this.formulas.get(actor, id);
    return row.executionLogs;
  }
}
