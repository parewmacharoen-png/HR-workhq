import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { WorkflowBuilderService } from '../../application/workflow-builder.service';
import { CreateRequestTypeDto, UpdateRequestTypeDto } from '../../application/dto/request.dto';

/** WF-001 — /admin/workflows API (extends Request Platform) */
@Controller()
export class WorkflowBuilderController {
  constructor(private readonly workflows: WorkflowBuilderService) {}

  @Get('workflows')
  @RequirePermission('workflow:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.workflows.list(actor, companyId, status, category);
  }

  @Post('workflows')
  @RequirePermission('workflow:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateRequestTypeDto) {
    return this.workflows.create(actor, dto);
  }

  @Get('workflows/:id')
  @RequirePermission('workflow:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.get(actor, id);
  }

  @Patch('workflows/:id')
  @RequirePermission('workflow:write')
  update(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: UpdateRequestTypeDto) {
    return this.workflows.update(actor, id, dto);
  }

  @Post('workflows/:id/publish')
  @RequirePermission('workflow:write')
  publish(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.publish(actor, id);
  }

  @Post('workflows/:id/archive')
  @RequirePermission('workflow:write')
  archive(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.archive(actor, id);
  }

  @Post('workflows/:id/restore')
  @RequirePermission('workflow:write')
  restore(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.restore(actor, id);
  }

  @Post('workflows/:id/clone')
  @RequirePermission('workflow:write')
  clone(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.clone(actor, id);
  }

  @Post('workflows/:id/version')
  @RequirePermission('workflow:write')
  version(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.version(actor, id);
  }

  @Delete('workflows/:id')
  @RequirePermission('workflow:write')
  delete(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.delete(actor, id);
  }

  @Get('workflows/:id/versions')
  @RequirePermission('workflow:read')
  versions(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.workflows.getVersionHistory(actor, id);
  }

  @Get('workflows/:id/versions/:versionId/action-steps')
  @RequirePermission('workflow:read')
  actionSteps(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
  ) {
    return this.workflows.listActionSteps(actor, id, versionId);
  }

  @Post('workflows/:id/versions/:versionId/action-steps')
  @RequirePermission('workflow:write')
  upsertActionStep(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Param('versionId') versionId: string,
    @Body() dto: {
      id?: string;
      stepOrder: number;
      name: string;
      stepType: string;
      configJson?: Record<string, unknown>;
      conditionJson?: Record<string, unknown>;
      timeoutHours?: number;
    },
  ) {
    return this.workflows.upsertActionStep(actor, id, versionId, dto as never);
  }
}
