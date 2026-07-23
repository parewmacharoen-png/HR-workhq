import {
  Body, Controller, Delete, Get, Param, Patch, Post, Query,
} from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { RequestTypeService } from '../../application/request-type.service';
import { RequestFormFieldService } from '../../application/request-form-field.service';
import { RequestApprovalFlowService } from '../../application/request-approval-flow.service';
import { RequestInstanceService } from '../../application/request-instance.service';
import { RequestApprovalService } from '../../application/request-approval.service';
import { RequestIntegrationService } from '../../application/request-integration.service';
import { RequestDashboardService } from '../../application/request-dashboard.service';
import {
  EmployeeReferralService, ReferralProgramService,
} from '../../application/employee-referral.service';
import {
  AddCommentDto, ApproveRequestDto, CancelRequestDto, CreateApprovalFlowDto,
  CreateApprovalStepDto, CreateEmployeeReferralDto, CreateFormFieldDto,
  CreateReferralProgramDto, CreateRequestTypeDto, LinkEmployeeReferralDto,
  ListApprovalHistoryQuery, ListRequestsQuery, PatchRequestValuesDto, RejectRequestDto, ReorderFieldsDto,
  ReorderStepsDto, UpdateApprovalStepDto, UpdateEmployeeReferralDto,
  UpdateFormFieldDto, UpdateReferralProgramDto, UpdateRequestTypeDto,
} from '../../application/dto/request.dto';

@Controller()
export class RequestController {
  constructor(
    private readonly types: RequestTypeService,
    private readonly fields: RequestFormFieldService,
    private readonly flows: RequestApprovalFlowService,
    private readonly instances: RequestInstanceService,
    private readonly approval: RequestApprovalService,
    private readonly integration: RequestIntegrationService,
    private readonly dashboard: RequestDashboardService,
    private readonly referrals: EmployeeReferralService,
    private readonly programs: ReferralProgramService,
  ) {}

  // ── Request types (REQ-002) ───────────────────────────────────────────────

  @Post('request-types')
  @RequirePermission('workflow:write')
  createType(@CurrentActor() actor: ActorContext, @Body() dto: CreateRequestTypeDto) {
    return this.types.create(actor, dto);
  }

  @Get('request-types')
  @RequirePermission('workflow:read')
  listTypes(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('category') category?: string,
  ) {
    return this.types.list(actor, companyId, status, category);
  }

  @Get('request-types/:id')
  @RequirePermission('workflow:read')
  getType(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.types.get(actor, id);
  }

  @Patch('request-types/:id')
  @RequirePermission('workflow:write')
  updateType(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateRequestTypeDto,
  ) {
    return this.types.update(actor, id, dto);
  }

  @Post('request-types/:id/clone')
  @RequirePermission('workflow:write')
  cloneType(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.types.clone(actor, id);
  }

  @Post('request-types/:id/publish')
  @RequirePermission('workflow:write')
  publishType(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.types.publish(actor, id);
  }

  @Post('request-types/:id/archive')
  @RequirePermission('workflow:write')
  archiveType(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.types.archive(actor, id);
  }

  @Post('request-types/:id/restore')
  @RequirePermission('workflow:write')
  restoreType(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.types.restore(actor, id);
  }

  @Delete('request-types/:id')
  @RequirePermission('workflow:write')
  deleteType(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.types.softDelete(actor, id);
  }

  @Get('telegram/request-types/available')
  listTelegramTypes(
    @Query('employeeId') employeeId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.types.listAvailableForTelegram(employeeId, companyId);
  }

  // ── Form fields (REQ-003) ─────────────────────────────────────────────────

  @Post('request-types/:id/versions/:versionId/fields')
  @RequirePermission('workflow:write')
  createField(
    @CurrentActor() actor: ActorContext,
    @Param('id') typeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateFormFieldDto,
  ) {
    return this.fields.create(actor, typeId, versionId, dto);
  }

  @Patch('request-fields/:id')
  @RequirePermission('workflow:write')
  updateField(
    @CurrentActor() actor: ActorContext,
    @Param('id') fieldId: string,
    @Body() dto: UpdateFormFieldDto,
  ) {
    return this.fields.update(actor, fieldId, dto);
  }

  @Delete('request-fields/:id')
  @RequirePermission('workflow:write')
  deleteField(@CurrentActor() actor: ActorContext, @Param('id') fieldId: string) {
    return this.fields.delete(actor, fieldId);
  }

  @Post('request-fields/:id/clone')
  @RequirePermission('workflow:write')
  cloneField(@CurrentActor() actor: ActorContext, @Param('id') fieldId: string) {
    return this.fields.clone(actor, fieldId);
  }

  @Post('request-types/:id/versions/:versionId/fields/reorder')
  @RequirePermission('workflow:write')
  reorderFields(
    @CurrentActor() actor: ActorContext,
    @Param('id') typeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: ReorderFieldsDto,
  ) {
    return this.fields.reorder(actor, typeId, versionId, dto);
  }

  @Post('request-types/:id/versions/:versionId/preview')
  @RequirePermission('workflow:read')
  previewForm(
    @CurrentActor() actor: ActorContext,
    @Param('id') typeId: string,
    @Param('versionId') versionId: string,
    @Body() body: { sampleValues?: Record<string, unknown> },
  ) {
    return this.fields.preview(actor, typeId, versionId, body.sampleValues);
  }

  // ── Approval flows (REQ-004) ──────────────────────────────────────────────

  @Post('request-types/:id/versions/:versionId/approval-flow')
  @RequirePermission('workflow:write')
  createFlow(
    @CurrentActor() actor: ActorContext,
    @Param('id') typeId: string,
    @Param('versionId') versionId: string,
    @Body() dto: CreateApprovalFlowDto,
  ) {
    return this.flows.createFlow(actor, typeId, versionId, dto);
  }

  @Patch('approval-flows/:id')
  @RequirePermission('workflow:write')
  updateFlow(
    @CurrentActor() actor: ActorContext,
    @Param('id') flowId: string,
    @Body() dto: CreateApprovalFlowDto,
  ) {
    return this.flows.updateFlow(actor, flowId, dto);
  }

  @Post('approval-flows/:id/steps')
  @RequirePermission('workflow:write')
  addStep(
    @CurrentActor() actor: ActorContext,
    @Param('id') flowId: string,
    @Body() dto: CreateApprovalStepDto,
  ) {
    return this.flows.addStep(actor, flowId, dto);
  }

  @Patch('approval-steps/:id')
  @RequirePermission('workflow:write')
  updateStep(
    @CurrentActor() actor: ActorContext,
    @Param('id') stepId: string,
    @Body() dto: UpdateApprovalStepDto,
  ) {
    return this.flows.updateStep(actor, stepId, dto);
  }

  @Delete('approval-steps/:id')
  @RequirePermission('workflow:write')
  deleteStep(@CurrentActor() actor: ActorContext, @Param('id') stepId: string) {
    return this.flows.deleteStep(actor, stepId);
  }

  @Post('approval-flows/:id/steps/reorder')
  @RequirePermission('workflow:write')
  reorderSteps(
    @CurrentActor() actor: ActorContext,
    @Param('id') flowId: string,
    @Body() dto: ReorderStepsDto,
  ) {
    return this.flows.reorderSteps(actor, flowId, dto);
  }

  // ── Request instances (REQ-001) ───────────────────────────────────────────

  @Get('requests/my')
  @RequirePermission('workflow:read')
  listMy(@CurrentActor() actor: ActorContext) {
    return this.instances.listMy(actor);
  }

  @Get('requests/pending-approval')
  @RequirePermission('workflow:act')
  listPendingApproval(@CurrentActor() actor: ActorContext) {
    return this.instances.listPendingApproval(actor);
  }

  @Get('requests/approval-history')
  @RequirePermission('workflow:act')
  listApprovalHistory(
    @CurrentActor() actor: ActorContext,
    @Query() query: ListApprovalHistoryQuery,
  ) {
    return this.instances.listApprovalHistory(actor, query);
  }

  @Get('requests/dashboard')
  @RequirePermission('workflow:read')
  getDashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.dashboard.getDashboard(actor, companyId);
  }

  @Get('requests')
  @RequirePermission('workflow:read')
  list(@CurrentActor() actor: ActorContext, @Query() query: ListRequestsQuery) {
    return this.instances.list(actor, query);
  }

  @Get('requests/:id')
  @RequirePermission('workflow:read')
  get(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.instances.get(actor, id);
  }

  @Post('request-types/:typeId/requests/draft')
  @RequirePermission('workflow:read')
  createDraft(
    @CurrentActor() actor: ActorContext,
    @Param('typeId') typeId: string,
    @Query('companyId') companyId: string,
  ) {
    return this.instances.createDraft(actor, typeId, companyId);
  }

  @Patch('requests/:id/values')
  @RequirePermission('workflow:read')
  patchValues(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: PatchRequestValuesDto,
  ) {
    return this.instances.patchValues(actor, id, dto);
  }

  @Post('requests/:id/submit')
  @RequirePermission('workflow:read')
  submit(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.instances.submit(actor, id);
  }

  @Post('requests/:id/cancel')
  @RequirePermission('workflow:read')
  cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: CancelRequestDto,
  ) {
    return this.instances.cancel(actor, id, dto);
  }

  @Post('requests/:id/comments')
  @RequirePermission('workflow:read')
  addComment(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: AddCommentDto,
  ) {
    return this.instances.addComment(actor, id, dto);
  }

  @Post('requests/:id/approve')
  @RequirePermission('workflow:act')
  approve(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: ApproveRequestDto,
  ) {
    return this.approval.approve(actor, id, dto);
  }

  @Post('requests/:id/reject')
  @RequirePermission('workflow:act')
  reject(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: RejectRequestDto,
  ) {
    return this.approval.reject(actor, id, dto);
  }

  @Post('requests/:id/retry-integration')
  @RequirePermission('workflow:write')
  async retryIntegration(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    await this.integration.forceRetryIntegration(actor, id);
    return this.instances.get(actor, id);
  }

  // ── Employee referrals (REC-002) — separate from post-hire Referral module ──

  @Post('employee-referrals')
  @RequirePermission('referral:write')
  createReferral(@CurrentActor() actor: ActorContext, @Body() dto: CreateEmployeeReferralDto) {
    return this.referrals.create(actor, dto);
  }

  @Get('employee-referrals/my')
  @RequirePermission('referral:read')
  listMyReferrals(@CurrentActor() actor: ActorContext) {
    return this.referrals.listMy(actor);
  }

  @Get('employee-referrals')
  @RequirePermission('referral:read')
  listReferrals(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
    @Query('status') status?: string,
  ) {
    return this.referrals.list(actor, companyId, status);
  }

  @Get('employee-referrals/dashboard')
  @RequirePermission('referral:read')
  getReferralDashboard(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId: string,
  ) {
    return this.referrals.getReferralDashboardWidgets(actor, companyId);
  }

  @Get('employee-referrals/:id')
  @RequirePermission('referral:read')
  getReferral(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.referrals.get(actor, id);
  }

  @Patch('employee-referrals/:id')
  @RequirePermission('referral:write')
  updateReferral(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateEmployeeReferralDto,
  ) {
    return this.referrals.update(actor, id, dto);
  }

  @Post('employee-referrals/:id/mark-hired')
  @RequirePermission('referral:write')
  markHired(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.referrals.markHired(actor, id);
  }

  @Post('employee-referrals/:id/link-employee')
  @RequirePermission('referral:write')
  linkEmployee(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: LinkEmployeeReferralDto,
  ) {
    return this.referrals.linkEmployee(actor, id, dto);
  }

  @Post('employee-referrals/:id/approve-bonus')
  @RequirePermission('referral:pay')
  approveBonus(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.referrals.approveBonus(actor, id);
  }

  @Post('employee-referrals/:id/mark-paid')
  @RequirePermission('referral:pay')
  markPaid(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.referrals.markPaid(actor, id);
  }

  @Post('referral-programs')
  @RequirePermission('referral:write')
  createProgram(@CurrentActor() actor: ActorContext, @Body() dto: CreateReferralProgramDto) {
    return this.programs.create(actor, dto);
  }

  @Get('referral-programs')
  @RequirePermission('referral:read')
  listPrograms(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
  ) {
    return this.programs.list(actor, companyId);
  }

  @Patch('referral-programs/:id')
  @RequirePermission('referral:write')
  updateProgram(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() dto: UpdateReferralProgramDto,
  ) {
    return this.programs.update(actor, id, dto);
  }

  @Post('referral-programs/:id/archive')
  @RequirePermission('referral:write')
  archiveProgram(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    return this.programs.archive(actor, id);
  }
}
