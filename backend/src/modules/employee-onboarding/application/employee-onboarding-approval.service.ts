// ============================================================================
// Idempotent onboarding approval — apply invitation preset + link Telegram
// ============================================================================

import { Inject, Injectable, Logger, Optional, forwardRef, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { TelegramIdentityService } from '../../security/application/telegram-identity.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { EmployeeSelfOnboardingService } from './employee-self-onboarding.service';
import { EmployeeOnboardingTimelineService } from './employee-onboarding-timeline.service';
import { InvitationEmploymentPreset } from '../domain/self-onboarding.types';
import {
  buildEmployeeUpdateFromPreset,
  allPresetCompanyIds,
  resolvePresetOrgContext,
  resolveCompanyOrgContext,
  presetAssignmentForCompany,
  buildAssignmentUpdateFromCompanyAssignment,
} from '../domain/employment-preset.util';
import { AccessControlService } from '../../permission/application/access-control.service';
import { PerformanceService } from '../../performance/application/performance.service';
import { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';
import { SharedPayrollService } from '../../payroll/application/shared-payroll.service';
import { qualifiesForSharedPayroll } from '../../payroll/domain/services/shared-payroll.policy';

export interface OnboardingApprovalParams {
  employeeId: string;
  telegramUserId: number;
  invitationId?: string | null;
  selfOnboardingSubmissionId?: string | null;
  registrationRequestId?: string | null;
  requestInstanceId?: string | null;
}

@Injectable()
export class EmployeeOnboardingApprovalService {
  private readonly logger = new Logger(EmployeeOnboardingApprovalService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => TelegramIdentityService))
    private readonly identities: TelegramIdentityService,
    private readonly timeline: EmployeeOnboardingTimelineService,
    @Optional() @Inject(forwardRef(() => EmployeeSelfOnboardingService))
    private readonly selfOnboarding?: EmployeeSelfOnboardingService,
    @Optional() @Inject(forwardRef(() => TelegramGatewayService))
    private readonly gateway?: TelegramGatewayService,
    @Optional() @Inject(forwardRef(() => AccessControlService))
    private readonly accessControl?: AccessControlService,
    @Optional() @Inject(forwardRef(() => PerformanceService))
    private readonly performance?: PerformanceService,
    @Optional() @Inject(forwardRef(() => SharedPayrollService))
    private readonly sharedPayroll?: SharedPayrollService,
  ) {}

  async isAlreadyApproved(params: OnboardingApprovalParams): Promise<boolean> {
    const identity = await this.prisma.telegramIdentity.findFirst({
      where: {
        employeeId: params.employeeId,
        telegramUserId: BigInt(params.telegramUserId),
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    if (!identity) return false;

    if (params.selfOnboardingSubmissionId) {
      const submission = await this.prisma.employeeSelfOnboardingSubmission.findUnique({
        where: { id: params.selfOnboardingSubmissionId },
      });
      if (submission && submission.status !== 'approved') return false;
    }

    const invite = params.invitationId
      ? await this.prisma.employeeTelegramInvite.findUnique({ where: { id: params.invitationId } })
      : await this.prisma.employeeTelegramInvite.findFirst({
        where: { employeeId: params.employeeId, status: 'used' },
        orderBy: { createdAt: 'desc' },
      });

    if (invite && invite.status !== 'used' && invite.status !== 'started') return false;

    return true;
  }

  async isAlreadyRejected(params: OnboardingApprovalParams): Promise<boolean> {
    if (params.selfOnboardingSubmissionId) {
      const submission = await this.prisma.employeeSelfOnboardingSubmission.findUnique({
        where: { id: params.selfOnboardingSubmissionId },
      });
      if (submission?.status === 'rejected') return true;
    }

    if (params.requestInstanceId) {
      const request = await this.prisma.requestInstance.findUnique({
        where: { id: params.requestInstanceId },
        select: { status: true },
      });
      if (request?.status === 'rejected') {
        const identity = await this.prisma.telegramIdentity.findFirst({
          where: {
            employeeId: params.employeeId,
            telegramUserId: BigInt(params.telegramUserId),
            status: 'REVOKED',
            deletedAt: null,
          },
        });
        if (identity) return true;
      }
    }

    return false;
  }

  async processApproved(
    actor: ActorContext,
    params: OnboardingApprovalParams,
  ): Promise<{ entityType: string; entityId: string; message: string; alreadyDone: boolean }> {
    if (await this.isAlreadyApproved(params)) {
      await this.clearTelegramOnboardingSession(params.telegramUserId);
      return {
        entityType: 'TelegramIdentity',
        entityId: params.employeeId,
        message: 'Onboarding already approved',
        alreadyDone: true,
      };
    }

    const invite = await this.resolveInvite(params);
    const preset = (invite?.presetJson ?? {}) as unknown as InvitationEmploymentPreset;

    if (params.selfOnboardingSubmissionId && this.selfOnboarding) {
      const submission = await this.prisma.employeeSelfOnboardingSubmission.findUnique({
        where: { id: params.selfOnboardingSubmissionId },
      });
      if (submission?.status === 'submitted') {
        await this.selfOnboarding.approve(actor, params.selfOnboardingSubmissionId);
      }
    }

    await this.prisma.$transaction(async (tx) => {
      await this.applyEmploymentPreset(tx, actor, params.employeeId, preset, invite?.companyId);

      if (params.registrationRequestId) {
        await this.identities.approveRegistration(actor, params.registrationRequestId, params.employeeId);
      } else {
        const pending = await tx.telegramIdentity.findFirst({
          where: {
            employeeId: params.employeeId,
            status: 'PENDING',
            deletedAt: null,
          },
          orderBy: { linkedAt: 'desc' },
        });
        if (pending) {
          await this.identities.promotePendingToActive(
            actor,
            params.employeeId,
            Number(pending.telegramUserId),
          );
        }
      }

      if (invite) {
        await tx.employeeTelegramInvite.updateMany({
          where: { id: invite.id, status: { in: ['pending', 'started'] } },
          data: {
            status: 'used',
            usedAt: new Date(),
            usedTelegramUserId: BigInt(params.telegramUserId),
          },
        });
      }
    });

    await this.applyBusinessRole(actor, params.employeeId, preset);
    await this.bootstrapProbation(actor, params.employeeId, preset);
    await this.bootstrapSharedPayroll(actor, params.employeeId, preset);

    const meta = {
      invitationId: invite?.id ?? params.invitationId,
      requestInstanceId: params.requestInstanceId,
      selfOnboardingSubmissionId: params.selfOnboardingSubmissionId,
    };
    await this.timeline.recordIfNew(params.employeeId, 'onboarding_approved', actor.userId, meta);
    await this.timeline.recordIfNew(params.employeeId, 'telegram_link_approved', actor.userId, meta);
    if (invite && !invite.employeeId) {
      await this.timeline.recordIfNew(params.employeeId, 'employee_created_from_invitation', actor.userId, meta);
    } else if (invite) {
      await this.timeline.recordIfNew(params.employeeId, 'employee_created_from_invitation', actor.userId, meta);
    }

    await this.audit.record(actor, {
      entityType: 'TelegramIdentity',
      entityId: params.employeeId,
      action: 'onboarding_approved',
      after: { ...params, invitationId: invite?.id },
    });

    if (!params.selfOnboardingSubmissionId) {
      await this.notifyTelegram(params.telegramUserId, '✅ ลงทะเบียนสำเร็จ HR อนุมัติแล้ว');
    }

    await this.clearTelegramOnboardingSession(params.telegramUserId);

    const hasApproved = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId: params.employeeId, status: 'approved' },
      select: { id: true },
    });
    if (hasApproved) {
      await this.prisma.employeeSelfOnboardingSubmission.updateMany({
        where: { employeeId: params.employeeId, status: 'draft' },
        data: { status: 'cancelled' },
      });
    } else {
      await this.prisma.employeeSelfOnboardingSubmission.updateMany({
        where: { employeeId: params.employeeId, status: 'draft' },
        data: {
          status: 'approved',
          reviewedAt: new Date(),
          reviewedBy: actor.userId,
        },
      });
    }

    return {
      entityType: 'TelegramIdentity',
      entityId: params.employeeId,
      message: 'Onboarding approved',
      alreadyDone: false,
    };
  }

  async processRejected(
    actor: ActorContext,
    params: OnboardingApprovalParams,
    reason: string,
  ): Promise<void> {
    if (await this.isAlreadyRejected(params)) return;

    if (params.registrationRequestId) {
      await this.identities.rejectRegistration(actor, params.registrationRequestId, reason);
    } else if (params.telegramUserId) {
      await this.prisma.telegramIdentity.updateMany({
        where: {
          telegramUserId: BigInt(params.telegramUserId),
          status: { in: ['PENDING', 'ACTIVE'] },
          deletedAt: null,
        },
        data: { status: 'REVOKED', updatedBy: actor.userId },
      });
    }

    if (params.selfOnboardingSubmissionId) {
      await this.prisma.employeeSelfOnboardingSubmission.updateMany({
        where: { id: params.selfOnboardingSubmissionId, status: 'submitted' },
        data: {
          status: 'rejected',
          rejectedReason: reason,
          reviewedAt: new Date(),
          reviewedBy: actor.userId,
        },
      });
    }

    const invite = await this.resolveInvite(params);
    if (invite) {
      await this.prisma.employeeTelegramInvite.updateMany({
        where: { id: invite.id, status: { in: ['pending', 'started'] } },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: reason,
        },
      });
    }

    await this.timeline.recordIfNew(params.employeeId, 'onboarding_rejected', actor.userId, {
      invitationId: invite?.id,
      requestInstanceId: params.requestInstanceId,
      reason,
    });

    await this.audit.record(actor, {
      entityType: 'TelegramIdentity',
      entityId: params.employeeId,
      action: 'onboarding_rejected',
      after: { reason, ...params },
    });

    await this.notifyTelegram(
      params.telegramUserId,
      '❌ คำขอลงทะเบียนไม่ผ่านการอนุมัติ กรุณาติดต่อ HR',
    );
  }

  async approveFromSubmission(actor: ActorContext, submissionId: string) {
    const params = await this.resolveParamsFromSubmission(submissionId);
    return this.processApproved(actor, params);
  }

  async rejectFromSubmission(actor: ActorContext, submissionId: string, reason: string) {
    const params = await this.resolveParamsFromSubmission(submissionId);
    await this.processRejected(actor, params, reason.trim() || 'ไม่อนุมัติโดย HR');
  }

  async completeExistingEmployeeInviteLink(
    actor: ActorContext,
    employeeId: string,
    telegramUserId: number,
  ) {
    const invite = await this.resolveInvite({ employeeId, telegramUserId, invitationId: null });
    return this.processApproved(actor, {
      employeeId,
      telegramUserId,
      invitationId: invite?.id ?? null,
    });
  }

  private async resolveParamsFromSubmission(submissionId: string): Promise<OnboardingApprovalParams> {
    const submission = await this.prisma.employeeSelfOnboardingSubmission.findUnique({
      where: { id: submissionId },
    });
    if (!submission) throw new NotFoundException('Submission not found');
    if (submission.status !== 'submitted') {
      throw new BadRequestException('Only submitted records can be reviewed');
    }

    const identity = await this.prisma.telegramIdentity.findFirst({
      where: {
        employeeId: submission.employeeId,
        status: { in: ['PENDING', 'ACTIVE'] },
        deletedAt: null,
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!identity) {
      throw new BadRequestException('No Telegram identity linked for this submission');
    }

    const telegramUserId = Number(identity.telegramUserId);
    const invite = await this.resolveInvite({
      employeeId: submission.employeeId,
      telegramUserId,
      invitationId: null,
    });

    return {
      employeeId: submission.employeeId,
      telegramUserId,
      invitationId: invite?.id ?? null,
      selfOnboardingSubmissionId: submission.id,
      requestInstanceId: submission.requestInstanceId,
    };
  }

  private async resolveInvite(params: OnboardingApprovalParams) {
    if (params.invitationId) {
      return this.prisma.employeeTelegramInvite.findUnique({ where: { id: params.invitationId } });
    }
    return this.prisma.employeeTelegramInvite.findFirst({
      where: { employeeId: params.employeeId, status: { in: ['pending', 'started', 'used'] } },
      orderBy: { createdAt: 'desc' },
    });
  }

  private async applyEmploymentPreset(
    tx: Prisma.TransactionClient,
    actor: ActorContext,
    employeeId: string,
    preset: InvitationEmploymentPreset,
    companyId?: string,
  ): Promise<void> {
    const { departmentName } = await resolvePresetOrgContext(tx, preset);

    const employeeUpdate = buildEmployeeUpdateFromPreset(preset, departmentName);
    if (Object.keys(employeeUpdate).length > 0) {
      await tx.employee.update({
        where: { id: employeeId },
        data: { ...employeeUpdate, updatedBy: actor.userId },
      });
    }

    const cid = preset.companyId || companyId;
    if (!cid) return;

    const companyIds = allPresetCompanyIds({ ...preset, companyId: cid });

    for (let i = 0; i < companyIds.length; i += 1) {
      const targetCompanyId = companyIds[i];
      const isPrimary = i === 0;
      const companyAssignment = presetAssignmentForCompany(preset, targetCompanyId);
      const { functionId } = await resolveCompanyOrgContext(tx, companyAssignment);
      const assignmentUpdate = buildAssignmentUpdateFromCompanyAssignment(
        preset,
        companyAssignment,
        functionId,
        isPrimary,
      );

      const assignment = await tx.employeeAssignment.findFirst({
        where: { employeeId, companyId: targetCompanyId, effectiveTo: null, deletedAt: null },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (assignment) {
        await tx.employeeAssignment.update({
          where: { id: assignment.id },
          data: {
            ...assignmentUpdate,
            updatedBy: actor.userId,
          },
        });
      } else if (preset.startDate) {
        await tx.employeeAssignment.create({
          data: {
            id: randomUUID(),
            employeeId,
            companyId: targetCompanyId,
            teamId: companyAssignment.teamId ?? null,
            functionId,
            roleLevel: assignmentUpdate.roleLevel as 'employee' | 'sub_leader' | 'big_leader',
            effectiveFrom: new Date(preset.startDate),
            isPrimaryCompany: isPrimary,
            isPrimaryTeam: isPrimary && Boolean(companyAssignment.teamId),
            createdBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      }
    }
  }

  private async resolveDepartmentName(
    tx: Prisma.TransactionClient,
    departmentId?: string,
  ): Promise<string | null> {
    if (!departmentId) return null;
    const fn = await tx.function.findFirst({
      where: { id: departmentId, deletedAt: null },
      select: { name: true },
    });
    return fn?.name ?? null;
  }

  private async applyBusinessRole(
    actor: ActorContext,
    employeeId: string,
    preset: InvitationEmploymentPreset,
  ): Promise<void> {
    if (!preset.businessRole || !this.accessControl) return;

    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null, isActive: true },
    });
    if (!user) return;

    const existing = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId: user.id, isActive: true, deletedAt: null },
    });
    if (existing) return;

    const role = preset.businessRole as BusinessRoleCode;
    const companyScopeIds = allPresetCompanyIds(preset);
    const teamScopeIds = preset.teamId ? [preset.teamId] : [];

    try {
      await this.accessControl.assignBusinessRole(actor, user.id, {
        role,
        companyScopeIds,
        teamScopeIds,
        reason: 'onboarding_approval',
      });
    } catch (err: unknown) {
      this.logger.warn(`Business role assignment skipped: ${(err as Error).message}`);
    }
  }

  private async bootstrapSharedPayroll(
    actor: ActorContext,
    employeeId: string,
    preset: InvitationEmploymentPreset,
  ): Promise<void> {
    if (!this.sharedPayroll || !preset.monthlySalary || preset.monthlySalary < 1) return;
    if (!qualifiesForSharedPayroll({
      department: preset.department,
      position: preset.position,
      businessRole: preset.businessRole,
    })) return;

    await this.sharedPayroll.bootstrapSharedEmployee(actor, {
      employeeId,
      masterMonthlySalary: preset.monthlySalary,
      effectiveFromIso: preset.startDate,
      depositCollectionCompanyId: preset.depositCollectionCompanyId ?? preset.companyId,
      department: preset.department,
      position: preset.position,
      businessRole: preset.businessRole,
      reason: 'เงินเดือนเริ่มต้นจากลิงก์เชิญ Telegram',
    });
  }

  private async bootstrapProbation(
    actor: ActorContext,
    employeeId: string,
    preset: InvitationEmploymentPreset,
  ): Promise<void> {
    if (!this.performance || !preset.companyId) return;
    const employee = await this.prisma.employee.findUnique({ where: { id: employeeId } });
    if (!employee) return;

    try {
      await this.performance.bootstrapProbationReviewOnOnboarding(actor, {
        employeeId,
        companyId: preset.companyId,
        hireDate: preset.startDate ? new Date(preset.startDate) : employee.hireDate,
        probationEndDate: employee.probationEndDate,
        employmentStatus: employee.employmentStatus,
      });
    } catch (err: unknown) {
      this.logger.warn(`Probation bootstrap skipped: ${(err as Error).message}`);
    }
  }

  private async notifyTelegram(telegramUserId: number, text: string): Promise<void> {
    if (!telegramUserId || !this.gateway) return;
    const account = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
      select: { chatId: true },
    });
    if (!account?.chatId) return;
    await this.gateway.sendMessage({ chatId: Number(account.chatId), text }).catch(() => undefined);
  }

  private async clearTelegramOnboardingSession(telegramUserId: number): Promise<void> {
    if (!telegramUserId) return;
    const account = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
      select: { id: true },
    });
    if (!account) return;
    await this.prisma.telegramSession.updateMany({
      where: { telegramAccountId: account.id },
      data: { state: 'idle', context: {} },
    });
  }
}
