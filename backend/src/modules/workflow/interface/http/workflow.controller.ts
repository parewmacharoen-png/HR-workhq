// ============================================================================
// modules/workflow/interface/http/workflow.controller.ts
// ============================================================================

import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { WorkflowService, ActOnWorkflowInput } from '../../application/workflow.service';
import { ApprovalResolverService } from '../../application/approval-resolver.service';
import { ApprovalMatrixService } from '../../application/approval-matrix.service';
import { WorkflowInboxService } from '../../application/workflow-inbox.service';
import { ApprovalHubService } from '../../application/approval-hub.service';
import { ApprovalDelegationService } from '../../application/approval-delegation.service';
import { ApprovalHubPendingQueryDto, ApprovalHubSummaryQueryDto } from '../../application/dto/approval-hub.dto';
import { UpdateApprovalMatrixDto, WorkflowPreviewDto } from '../../application/dto/approval.dto';
import { CreateDelegationDto, HistoryQueryDto, InboxQueryDto } from '../../application/dto/workflow-inbox.dto';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { RequestContextService } from '../../../../common/context/request-context';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { WorkflowEntityType } from '../../domain/entities/workflow.entity';

class ActDto implements ActOnWorkflowInput {
  @IsEnum(['approve', 'reject', 'return', 'escalate', 'override', 'cancel'] as const)
  action!: 'approve' | 'reject' | 'return' | 'escalate' | 'override' | 'cancel';

  @IsOptional() @IsString() comment?: string;

  @IsOptional()
  @IsEnum(['approved', 'rejected'] as const)
  overrideTo?: 'approved' | 'rejected';
}

@Controller('workflow')
export class WorkflowController {
  constructor(
    private readonly service: WorkflowService,
    private readonly approvalResolver: ApprovalResolverService,
    private readonly approvalMatrix: ApprovalMatrixService,
    private readonly inboxService: WorkflowInboxService,
    private readonly approvalHub: ApprovalHubService,
    private readonly delegation: ApprovalDelegationService,
    private readonly requestContext: RequestContextService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('inbox')
  @RequirePermission('workflow:act')
  async listInbox(@CurrentActor() actor: ActorContext, @Query() query: InboxQueryDto) {
    const companyId = query.companyId ?? actor.companyId ?? null;
    return this.inboxService.listPendingInbox(
      actor.userId,
      companyId,
      query.entityType as WorkflowEntityType | undefined,
      query.limit ?? 50,
    );
  }

  @Get('approval-hub/summary')
  @RequirePermission('workflow:act')
  approvalHubSummary(
    @CurrentActor() actor: ActorContext,
    @Query() query: ApprovalHubSummaryQueryDto,
  ) {
    return this.approvalHub.getDailySummary(actor, query.companyId ?? actor.companyId ?? null);
  }

  @Get('approval-hub/pending')
  @RequirePermission('workflow:act')
  approvalHubPending(
    @CurrentActor() actor: ActorContext,
    @Query() query: ApprovalHubPendingQueryDto,
  ) {
    return this.approvalHub.listPending(actor, {
      companyId: query.companyId ?? actor.companyId ?? null,
      search: query.search,
      category: query.category,
      limit: query.limit,
      offset: query.offset,
    });
  }

  @Get('history')
  @RequirePermission('workflow:act')
  async history(@CurrentActor() actor: ActorContext, @Query() query: HistoryQueryDto) {
    return this.inboxService.listHistory(actor.userId, {
      companyId: query.companyId ?? actor.companyId ?? null,
      status: query.status,
      entityType: query.entityType as WorkflowEntityType | undefined,
      from: query.from ? new Date(query.from) : undefined,
      to: query.to ? new Date(query.to) : undefined,
      limit: query.limit ?? 50,
    });
  }

  @Get('instances/:id')
  @RequirePermission('workflow:act')
  async instanceDetail(@Param('id') id: string) {
    const detail = await this.inboxService.getInstanceDetail(id);
    if (!detail) return { error: 'NOT_FOUND' };
    return detail;
  }

  @Get('instances/:id/timeline')
  @RequirePermission('workflow:act')
  async timeline(@Param('id') id: string) {
    const detail = await this.inboxService.getInstanceDetail(id);
    if (!detail) return { timeline: [] };
    return { timeline: detail.timeline, instance: detail.instance };
  }

  @Get('delegations')
  @RequirePermission('workflow:act')
  listDelegations(@CurrentActor() actor: ActorContext) {
    return this.delegation.listForUser(actor.userId);
  }

  @Post('delegations')
  @RequirePermission('workflow:act')
  createDelegation(@CurrentActor() actor: ActorContext, @Body() dto: CreateDelegationDto) {
    return this.delegation.create(actor, {
      delegateUserId: dto.delegateUserId,
      companyId: dto.companyId ?? actor.companyId ?? null,
      entityType: dto.entityType as WorkflowEntityType | undefined,
      validFrom: new Date(dto.validFrom),
      validTo: new Date(dto.validTo),
      reason: dto.reason ?? null,
    });
  }

  @Delete('delegations/:id')
  @RequirePermission('workflow:act')
  revokeDelegation(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.delegation.revoke(actor, id);
  }

  @Post('preview')
  @RequirePermission('leave:read')
  async preview(@Body() dto: WorkflowPreviewDto) {
    const context = await this.buildApprovalContext(dto.employeeId, dto.companyId, dto.leaveTypeCode);
    const result = await this.approvalResolver.resolveWorkflow(dto.workflowType, context);
    return {
      workflowType: result.workflowType,
      approvalMode: result.approvalMode,
      minApprovalCount: result.minApprovalCount,
      requiresOwner: result.requiresOwner,
      approvers: result.approvers.map((a) => ({
        employeeId: a.employeeId,
        userId: a.userId,
        name: a.name,
        strategy: a.strategy,
        stepOrder: a.stepOrder,
        stepLabel: a.stepLabel,
      })),
      steps: result.steps.map((s) => ({
        stepOrder: s.stepOrder,
        label: s.label,
        approverStrategy: s.approverStrategy,
        approvers: s.approvers.map((a) => ({ employeeId: a.employeeId, name: a.name })),
      })),
    };
  }

  @Get('approval-matrix')
  @RequirePermission('settings:read')
  listMatrices(@Query('companyId') companyId?: string) {
    return this.approvalMatrix.listMatrices(companyId);
  }

  @Patch('approval-matrix/:id')
  @RequirePermission('settings:write')
  updateMatrix(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateApprovalMatrixDto,
  ) {
    return this.approvalMatrix.updateMatrix(actor, id, {
      name: dto.name,
      minApprovalCount: dto.minApprovalCount,
      steps: dto.steps?.map((s) => ({
        stepOrder: s.stepOrder,
        label: s.label,
        approverStrategy: s.approverStrategy as import('../../domain/types/approval.types').ApproverStrategyType,
        fixedUserId: s.fixedUserId,
        fixedRoleId: s.fixedRoleId,
      })),
    });
  }

  @Post('instances/:id/actions')
  @RequirePermission('workflow:act')
  act(@CurrentActor() actor: ActorContext, @Param('id') id: string, @Body() dto: ActDto) {
    this.requestContext.setWorkflowId(id);
    return this.service.act(actor, id, { ...dto, channel: 'web' });
  }

  private async buildApprovalContext(
    employeeId: string,
    companyId?: string,
    leaveTypeCode?: string,
  ) {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
      select: { companyId: true, roleLevel: true },
    });
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null },
      include: {
        businessRoleAssignments: {
          where: { isActive: true, deletedAt: null },
          take: 1,
        },
      },
    });
    return {
      employeeId,
      companyId: companyId ?? assignment?.companyId ?? null,
      leaveTypeCode,
      requesterRoleLevel: assignment?.roleLevel ?? null,
      requesterBusinessRole: user?.businessRoleAssignments[0]?.role ?? null,
    };
  }
}
