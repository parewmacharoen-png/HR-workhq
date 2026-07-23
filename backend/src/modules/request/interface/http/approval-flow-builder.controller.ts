import {
  Body, Controller, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import {
  ApprovalFlowBuilderService, CreateApprovalFlowDto, CreateApprovalStepDto,
} from '../../application/approval-flow-builder.service';

/** WF-002 — Dynamic Approval Flow Builder API */
@Controller()
export class ApprovalFlowBuilderController {
  constructor(private readonly flows: ApprovalFlowBuilderService) {}

  @Get('approval-flows')
  @RequirePermission('workflow:read')
  list(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
  ) {
    return this.flows.list(actor, companyId, status);
  }

  @Post('approval-flows')
  @RequirePermission('workflow:write')
  create(@CurrentActor() actor: ActorContext, @Body() dto: CreateApprovalFlowDto) {
    return this.flows.create(actor, dto);
  }

  @Get('approval-flows/:id')
  @RequirePermission('workflow:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.flows.get(actor, id);
  }

  @Patch('approval-flows/:id')
  @RequirePermission('workflow:write')
  update(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: Partial<CreateApprovalFlowDto>) {
    return this.flows.update(actor, id, dto);
  }

  @Post('approval-flows/:id/steps')
  @RequirePermission('workflow:write')
  upsertStep(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CreateApprovalStepDto & { id?: string },
  ) {
    return this.flows.upsertStep(actor, id, dto);
  }

  @Post('approval-flows/:id/publish')
  @RequirePermission('workflow:write')
  publish(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.flows.publish(actor, id);
  }

  @Post('approval-flows/:id/archive')
  @RequirePermission('workflow:write')
  archive(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.flows.archive(actor, id);
  }

  @Post('approval-flows/:id/clone')
  @RequirePermission('workflow:write')
  clone(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.flows.clone(actor, id);
  }

  @Post('approval-flows/:id/version')
  @RequirePermission('workflow:write')
  version(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.flows.version(actor, id);
  }

  @Post('approval-flows/:id/preview')
  @RequirePermission('workflow:read')
  preview(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() sample: { requesterEmployeeId: string; companyId: string; formValues?: Record<string, unknown> },
  ) {
    return this.flows.previewApprovers(actor, id, sample);
  }
}
