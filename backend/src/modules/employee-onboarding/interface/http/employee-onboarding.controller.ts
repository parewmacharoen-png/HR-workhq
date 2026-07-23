// ============================================================================
// EMP-001b/c — Self-onboarding + invite HTTP controllers
// ============================================================================

import { Body, Controller, Get, HttpCode, Param, Post, Query, Inject, forwardRef } from '@nestjs/common';
import { CurrentActor } from '../../../../auth/decorators/current-actor.decorator';
import { RequirePermission } from '../../../permission/interface/http/permission.guard';
import { ActorContext } from '../../../../shared/kernel/actor-context';
import { EmployeeTelegramInviteService } from '../../application/employee-telegram-invite.service';
import { EmployeeSelfOnboardingService } from '../../application/employee-self-onboarding.service';
import { EmployeeAccessService } from '../../../employee/application/employee-access.service';
import { EmployeeSelfOnboardingStatus, EmployeeTelegramInviteStatus } from '@prisma/client';
import { EmployeeOnboardingDashboardService } from '../../application/employee-onboarding-dashboard.service';
import { TelegramIdentityService } from '../../../security/application/telegram-identity.service';
import { OnboardingInviteAccessService } from '../../application/onboarding-invite-access.service';
import { EmployeeOnboardingApprovalService } from '../../application/employee-onboarding-approval.service';
import { ONBOARDING_INVITE_PERMISSIONS } from '../../domain/onboarding-invite-permissions';

@Controller()
export class EmployeeOnboardingController {
  constructor(
    private readonly invites: EmployeeTelegramInviteService,
    private readonly onboarding: EmployeeSelfOnboardingService,
    private readonly employeeAccess: EmployeeAccessService,
    @Inject(forwardRef(() => TelegramIdentityService))
    private readonly telegramIdentities: TelegramIdentityService,
    private readonly dashboard: EmployeeOnboardingDashboardService,
    private readonly inviteAccess: OnboardingInviteAccessService,
    private readonly onboardingApproval: EmployeeOnboardingApprovalService,
  ) {}

  @Post('employee-telegram-invites/quick')
  @HttpCode(201)
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.create)
  async createQuickNewEmployeeInvite(
    @CurrentActor() actor: ActorContext,
    @Body() body: { companyId: string; additionalCompanyIds?: string[] },
  ) {
    await this.inviteAccess.assertCanCreateNewEmployee(
      actor,
      body.companyId,
      null,
      body.additionalCompanyIds,
    );
    const result = await this.invites.createQuickNewEmployeeInvite(
      actor,
      body.companyId,
      body.additionalCompanyIds,
    );
    return {
      inviteId: result.inviteId,
      inviteLink: result.inviteLink,
      token: result.rawToken,
      expiresAt: result.expiresAt,
      status: result.status,
    };
  }

  @Post('employee-telegram-invites')
  @HttpCode(201)
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.create)
  async createNewEmployeeInvite(
    @CurrentActor() actor: ActorContext,
    @Body() body: {
      companyId: string;
      additionalCompanyIds?: string[];
      companyAssignments?: Array<{
        companyId: string;
        department?: string;
        departmentId?: string;
        teamId?: string;
      }>;
      businessRole: string;
      employmentType: string;
      startDate: string;
      departmentId?: string;
      department?: string;
      teamId?: string;
      position?: string;
      shiftId?: string;
      workLocation?: string;
      expiresAt?: string;
      note?: string;
      employeeId?: string;
      monthlySalary?: number;
      depositCollectionCompanyId?: string;
    },
  ) {
    if (body.employeeId) {
      await this.inviteAccess.assertCanLinkExisting(actor, body.employeeId, body.companyId);
      await this.employeeAccess.assertEmployeeWritable(actor, body.employeeId, body.companyId);
      const result = await this.invites.createInvite(actor, body.employeeId, body.companyId);
      return {
        inviteId: result.inviteId,
        inviteLink: result.inviteLink,
        token: result.rawToken,
        expiresAt: result.expiresAt,
        status: result.status,
      };
    }
    await this.inviteAccess.assertCanCreateNewEmployee(
      actor,
      body.companyId,
      body.teamId,
      body.additionalCompanyIds,
      body.companyAssignments,
    );
    const result = await this.invites.createNewEmployeeInvite(actor, body);
    return {
      inviteId: result.inviteId,
      inviteLink: result.inviteLink,
      token: result.rawToken,
      expiresAt: result.expiresAt,
      status: result.status,
    };
  }

  @Post('employees/:id/telegram-invite')
  @HttpCode(201)
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.create)
  async createInvite(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
    @Body('companyId') companyId: string,
  ) {
    await this.inviteAccess.assertCanLinkExisting(actor, employeeId, companyId);
    await this.employeeAccess.assertEmployeeWritable(actor, employeeId, companyId);
    const result = await this.invites.createInvite(actor, employeeId, companyId);
    return {
      inviteId: result.inviteId,
      inviteLink: result.inviteLink,
      token: result.rawToken,
      expiresAt: result.expiresAt,
      status: result.status,
    };
  }

  @Get('employees/:id/telegram-invites')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.view)
  async listEmployeeInvites(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
  ) {
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.inviteAccess.assertCanView(actor, companyId);
    return this.invites.listByEmployee(employeeId);
  }

  @Post('employees/:id/telegram-link')
  @HttpCode(201)
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.create)
  async createTelegramLink(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
    @Body('companyId') companyId: string,
  ) {
    await this.inviteAccess.assertCanLinkExisting(actor, employeeId, companyId);
    await this.employeeAccess.assertEmployeeWritable(actor, employeeId, companyId);
    return this.invites.createTelegramLink(actor, employeeId, companyId);
  }

  @Get('employees/:id/telegram-link')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.view)
  async getTelegramLink(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
  ) {
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.inviteAccess.assertCanView(actor, companyId);
    const link = await this.invites.getTelegramLink(employeeId);
    if (!link) {
      return {
        id: '',
        employeeId,
        token: '',
        deepLink: '',
        status: 'REVOKED' as const,
        expiresAt: '',
        usedAt: null,
      };
    }
    return link;
  }

  @Post('employees/:id/telegram-link/regenerate')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.regenerate)
  async regenerateTelegramLink(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
    @Body('companyId') companyId: string,
  ) {
    await this.inviteAccess.assertCanLinkExisting(actor, employeeId, companyId);
    await this.employeeAccess.assertEmployeeWritable(actor, employeeId, companyId);
    return this.invites.regenerateTelegramLink(actor, employeeId, companyId);
  }

  @Post('employees/:id/telegram-unlink')
  @RequirePermission('security:write')
  async unlinkTelegram(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
  ) {
    const companyId = await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    await this.employeeAccess.assertEmployeeWritable(actor, employeeId, companyId);
    return this.telegramIdentities.resetBinding(actor, employeeId);
  }

  @Get('employees/:id/self-onboarding')
  @RequirePermission('employee:read')
  async getEmployeeSelfOnboarding(
    @CurrentActor() actor: ActorContext,
    @Param('id') employeeId: string,
  ) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const submission = await this.onboarding.getByEmployee(employeeId);
    const telegramStatus = await this.invites.getEmployeeTelegramStatus(employeeId);
    return {
      telegramStatus,
      selfOnboardingStatus: this.onboarding.getSelfOnboardingStatusLabel(submission),
      submission,
    };
  }

  @Post('employee-telegram-invites/bulk-create')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.create)
  async bulkCreate(
    @CurrentActor() actor: ActorContext,
    @Body() body: { employeeIds: string[]; companyId: string },
  ) {
    const employeeIds = body.employeeIds ?? [];
    if (!employeeIds.length) {
      return { created: 0, invites: [] };
    }
    for (const employeeId of employeeIds) {
      await this.inviteAccess.assertCanLinkExisting(actor, employeeId, body.companyId);
    }
    return this.invites.bulkCreate(actor, employeeIds, body.companyId);
  }

  @Get('employee-telegram-invites')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.view)
  async listInvites(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const scopeWhere = await this.inviteAccess.buildListScopeWhere(actor, companyId);
    return this.invites.listInvites(scopeWhere, {
      status: status as EmployeeTelegramInviteStatus | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('employee-telegram-invites/:id')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.view)
  async getInvite(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
  ) {
    await this.inviteAccess.assertInviteReadable(actor, id);
    const detail = await this.invites.getInviteDetail(id);
    await this.invites.recordInviteViewed(actor, id);
    return detail;
  }

  @Post('employee-telegram-invites/:id/regenerate')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.regenerate)
  async regenerateInvite(@CurrentActor() actor: ActorContext, @Param('id') id: string) {
    await this.inviteAccess.assertCanRegenerate(actor, id);
    return this.invites.regenerateByInviteId(actor, id);
  }

  @Post('employee-telegram-invites/:id/cancel')
  @RequirePermission(ONBOARDING_INVITE_PERMISSIONS.cancel)
  async cancelInvite(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body('reason') reason?: string,
  ) {
    await this.inviteAccess.assertCanCancel(actor, id);
    return this.invites.cancelInvite(actor, id, reason);
  }

  @Get('self-onboarding/submissions')
  @RequirePermission('employee:read')
  listSubmissions(
    @CurrentActor() actor: ActorContext,
    @Query('companyId') companyId?: string,
    @Query('status') status?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.onboarding.listSubmissions(actor, {
      companyId: companyId ?? actor.companyId ?? undefined,
      status: status as EmployeeSelfOnboardingStatus | undefined,
      limit: limit ? Number(limit) : undefined,
      offset: offset ? Number(offset) : undefined,
    });
  }

  @Get('self-onboarding/submissions/:id')
  @RequirePermission('employee:read')
  async getSubmission(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
  ) {
    const submission = await this.onboarding.getSubmission(id);
    await this.employeeAccess.assertEmployeeReadable(actor, submission.employeeId);
    return submission;
  }

  @Post('self-onboarding/submissions/:id/approve')
  @RequirePermission('employee:write')
  async approve(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body() body: { approvedFields?: string[]; approvedDocumentIds?: string[] },
  ) {
    const submission = await this.onboarding.getSubmission(id);
    await this.employeeAccess.assertEmployeeWritable(actor, submission.employeeId, submission.companyId);
    if (body.approvedFields?.length || body.approvedDocumentIds?.length) {
      return this.onboarding.approve(actor, id, body.approvedFields, body.approvedDocumentIds);
    }
    return this.onboardingApproval.approveFromSubmission(actor, id);
  }

  @Post('self-onboarding/submissions/:id/reject')
  @RequirePermission('employee:write')
  async reject(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
    @Body('reason') reason: string,
  ) {
    const submission = await this.onboarding.getSubmission(id);
    await this.employeeAccess.assertEmployeeWritable(actor, submission.employeeId, submission.companyId);
    await this.onboardingApproval.rejectFromSubmission(actor, id, reason);
    return this.onboarding.getSubmission(id);
  }

  @Post('self-onboarding/submissions/:id/cancel')
  @RequirePermission('employee:write')
  async cancel(
    @CurrentActor() actor: ActorContext,
    @Param('id') id: string,
  ) {
    const submission = await this.onboarding.getSubmission(id);
    await this.employeeAccess.assertEmployeeWritable(actor, submission.employeeId, submission.companyId);
    return this.onboarding.cancel(actor, id);
  }

  @Get('self-onboarding/dashboard-stats')
  @RequirePermission('employee:read')
  async dashboardStats(@Query('companyId') companyId: string) {
    if (!companyId) return { error: 'companyId required' };
    return this.dashboard.getStats(companyId);
  }
}
