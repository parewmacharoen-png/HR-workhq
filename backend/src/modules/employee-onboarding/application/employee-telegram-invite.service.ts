// ============================================================================
// EMP-001b — Employee Telegram Invite Link Service
// ============================================================================

import { Injectable, BadRequestException, NotFoundException, Inject, Optional, forwardRef } from '@nestjs/common';
import { createHash, randomBytes, randomUUID } from 'crypto';
import { EmployeeTelegramInviteStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { TelegramIdentityService } from '../../security/application/telegram-identity.service';
import { TelegramProfile } from '../../security/domain/telegram-identity.types';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import {
  GLOBAL_ID_SEQUENCE,
  GlobalIdSequence,
  GlobalIdService,
} from '../../employee/domain/services/global-id.service';
import {
  buildAssignmentUpdateFromPreset,
  buildEmployeeUpdateFromPreset,
  defaultProbationEndDate,
  mapBusinessRoleToRoleLevel,
  mapWorkLocationToCategory,
  normalizeInviteCompanyIds,
  resolveInitialEmploymentFromType,
  resolvePresetOrgContext,
  resolveCompanyOrgContext,
  presetAssignmentForCompany,
  allPresetCompanyIds,
} from '../domain/employment-preset.util';
import { resolveTelegramConnectionStatus } from '../domain/telegram-connection-status.util';
import {
  InvitationEmploymentPreset,
  TelegramConnectionStatus,
} from '../domain/self-onboarding.types';
import { EmployeeOnboardingTimelineService } from './employee-onboarding-timeline.service';
import { TelegramHealthService } from '../../../common/monitoring/telegram-health.service';

const DEFAULT_EXPIRY_DAYS = 7;

export interface CreateInviteResult {
  inviteId: string;
  inviteLink: string;
  rawToken: string;
  expiresAt: Date;
  status: EmployeeTelegramInviteStatus;
}

export type TelegramLinkApiStatus = 'ACTIVE' | 'USED' | 'EXPIRED' | 'REVOKED';

export interface TelegramLinkResponse {
  id: string;
  employeeId: string;
  token: string;
  deepLink: string;
  status: TelegramLinkApiStatus;
  expiresAt: string;
  usedAt: string | null;
}

export interface CreateNewEmployeeInviteDto {
  companyId: string;
  additionalCompanyIds?: string[];
  companyAssignments?: Array<{
    companyId: string;
    department?: string;
    departmentId?: string;
    teamId?: string;
  }>;
  businessRole?: string;
  employmentType?: string;
  startDate?: string;
  departmentId?: string;
  department?: string;
  teamId?: string;
  position?: string;
  shiftId?: string;
  workLocation?: string;
  expiresAt?: string;
  note?: string;
  source?: string;
  monthlySalary?: number;
  depositCollectionCompanyId?: string;
}

@Injectable()
export class EmployeeTelegramInviteService {
  private readonly globalIds: GlobalIdService;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Inject(forwardRef(() => TelegramIdentityService))
    private readonly identities: TelegramIdentityService,
    @Inject(GLOBAL_ID_SEQUENCE) globalIdSequence: GlobalIdSequence,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly businessPermissions: BusinessPermissionRepository,
    private readonly telegramHealth: TelegramHealthService,
    @Optional() private readonly onboardingTimeline?: EmployeeOnboardingTimelineService,
  ) {
    this.globalIds = new GlobalIdService(globalIdSequence);
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async buildInviteLink(rawToken: string): Promise<string> {
    const botUsername = await this.telegramHealth.resolveBotUsername();
    if (!botUsername) {
      throw new BadRequestException(
        'Telegram bot ยังไม่ได้ตั้งค่า — กรุณาตั้ง TELEGRAM_BOT_TOKEN หรือ TELEGRAM_BOT_USERNAME',
      );
    }
    return `https://t.me/${botUsername}?start=invite_${rawToken}`;
  }

  mapInviteToApiStatus(
    status: EmployeeTelegramInviteStatus,
    expiresAt: Date,
  ): TelegramLinkApiStatus {
    if (status === 'pending') {
      return expiresAt < new Date() ? 'EXPIRED' : 'ACTIVE';
    }
    if (status === 'started') return 'USED';
    if (status === 'used') return 'USED';
    if (status === 'expired') return 'EXPIRED';
    return 'REVOKED';
  }

  toTelegramLinkResponse(
    invite: {
      id: string;
      employeeId: string | null;
      status: EmployeeTelegramInviteStatus;
      expiresAt: Date;
      usedAt: Date | null;
    },
    extras?: { token?: string; deepLink?: string },
  ): TelegramLinkResponse {
    return {
      id: invite.id,
      employeeId: invite.employeeId ?? '',
      token: extras?.token ?? '',
      deepLink: extras?.deepLink ?? '',
      status: this.mapInviteToApiStatus(invite.status, invite.expiresAt),
      expiresAt: invite.expiresAt.toISOString(),
      usedAt: invite.usedAt?.toISOString() ?? null,
    };
  }

  async findLatestTelegramLink(employeeId: string) {
    const pending = await this.prisma.employeeTelegramInvite.findFirst({
      where: { employeeId, status: 'pending' },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) return pending;

    return this.prisma.employeeTelegramInvite.findFirst({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getTelegramLink(employeeId: string): Promise<TelegramLinkResponse | null> {
    const invite = await this.findLatestTelegramLink(employeeId);
    if (!invite) return null;

    if (invite.status === 'pending' && invite.expiresAt < new Date()) {
      await this.prisma.employeeTelegramInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      return this.toTelegramLinkResponse({ ...invite, status: 'expired' });
    }

    return this.toTelegramLinkResponse(invite);
  }

  async createTelegramLink(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<TelegramLinkResponse> {
    const existingIdentity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, status: 'ACTIVE', deletedAt: null },
    });
    if (existingIdentity) {
      throw new BadRequestException('Employee already has active Telegram link');
    }

    const result = await this.createInvite(actor, employeeId, companyId);
    return this.toTelegramLinkResponse(
      {
        id: result.inviteId,
        employeeId,
        status: result.status,
        expiresAt: result.expiresAt,
        usedAt: null,
      },
      { token: result.rawToken, deepLink: result.inviteLink },
    );
  }

  async regenerateTelegramLink(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<TelegramLinkResponse> {
    const result = await this.createInvite(actor, employeeId, companyId);
    await this.auditInviteAction(actor, result.inviteId, 'invite_regenerated', {
      employeeId,
      companyId,
    });
    return this.toTelegramLinkResponse(
      {
        id: result.inviteId,
        employeeId,
        status: result.status,
        expiresAt: result.expiresAt,
        usedAt: null,
      },
      { token: result.rawToken, deepLink: result.inviteLink },
    );
  }

  async createInvite(actor: ActorContext, employeeId: string, companyId: string): Promise<CreateInviteResult> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee || employee.employmentStatus === 'terminated') {
      throw new NotFoundException('Employee not found');
    }

    const existingIdentity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, status: 'ACTIVE', deletedAt: null },
    });
    if (existingIdentity) {
      throw new BadRequestException('Employee already has active Telegram link');
    }

    await this.prisma.employeeTelegramInvite.updateMany({
      where: { employeeId, status: { in: ['pending', 'started'] } },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancellationReason: 'Superseded by new invite',
      },
    });

    return this.createInviteRecord(actor, { employeeId, companyId });
  }

  /** Clear stuck Telegram onboarding so HR can issue a fresh invite link. */
  async resetStuckTelegramOnboarding(actor: ActorContext, employeeId: string): Promise<void> {
    await this.prisma.telegramIdentity.updateMany({
      where: { employeeId, status: 'PENDING', deletedAt: null },
      data: { status: 'REVOKED', updatedBy: actor.userId },
    });

    const draft = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status: { in: ['draft', 'rejected'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (draft) {
      await this.prisma.employeeSelfOnboardingDocument.deleteMany({
        where: { submissionId: draft.id },
      });
      await this.prisma.employeeSelfOnboardingSubmission.update({
        where: { id: draft.id },
        data: {
          submittedDataJson: {},
          status: 'draft',
          submittedAt: null,
          reviewedAt: null,
          reviewedBy: null,
          rejectedReason: null,
        },
      });
    }

    await this.prisma.employeeTelegramInvite.updateMany({
      where: { employeeId, status: { in: ['pending', 'started'] } },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancellationReason: 'Onboarding reset by HR',
      },
    });

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'telegram_onboarding_reset',
      after: { draftReset: Boolean(draft) },
    });
  }

  async createQuickNewEmployeeInvite(
    actor: ActorContext,
    companyId: string,
    additionalCompanyIds?: string[],
  ): Promise<CreateInviteResult> {
    return this.createNewEmployeeInvite(actor, {
      companyId,
      additionalCompanyIds,
      businessRole: 'employee',
      employmentType: 'full_time',
      startDate: new Date().toISOString().slice(0, 10),
      source: 'telegram_invitation_quick',
    });
  }

  async createNewEmployeeInvite(
    actor: ActorContext,
    dto: CreateNewEmployeeInviteDto,
  ): Promise<CreateInviteResult> {
    if (!dto.companyId) {
      throw new BadRequestException('companyId is required');
    }

    const businessRole = dto.businessRole?.trim() || 'employee';
    const employmentType = dto.employmentType?.trim() || 'full_time';
    const startDate = dto.startDate?.trim() || new Date().toISOString().slice(0, 10);

    const { primaryCompanyId, additionalCompanyIds } = normalizeInviteCompanyIds(
      dto.companyId,
      dto.additionalCompanyIds,
    );
    const companyAssignments = dto.companyAssignments?.length
      ? dto.companyAssignments
      : undefined;

    const preset: InvitationEmploymentPreset = {
      companyId: primaryCompanyId,
      additionalCompanyIds: additionalCompanyIds.length > 0 ? additionalCompanyIds : undefined,
      companyAssignments,
      businessRole,
      employmentType,
      startDate,
      departmentId: dto.departmentId,
      department: dto.department?.trim() || undefined,
      teamId: dto.teamId,
      position: dto.position,
      shiftId: dto.shiftId,
      workLocation: dto.workLocation,
      note: dto.note,
      source: dto.source ?? 'telegram_invitation',
      monthlySalary: dto.monthlySalary,
      depositCollectionCompanyId: dto.depositCollectionCompanyId,
    };

    return this.createInviteRecord(actor, {
      companyId: primaryCompanyId,
      presetJson: preset,
      expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
    });
  }

  private async createInviteRecord(
    actor: ActorContext,
    params: {
      employeeId?: string;
      companyId: string;
      presetJson?: InvitationEmploymentPreset;
      expiresAt?: Date;
    },
  ): Promise<CreateInviteResult> {
    const rawToken = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(rawToken);
    const expiresAt = params.expiresAt
      ?? new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    const invite = await this.prisma.employeeTelegramInvite.create({
      data: {
        employeeId: params.employeeId ?? null,
        companyId: params.companyId,
        presetJson: (params.presetJson ?? { companyId: params.companyId }) as object,
        tokenHash,
        tokenPreview: rawToken.slice(0, 8),
        status: 'pending',
        expiresAt,
        createdBy: actor.userId,
      },
    });

    await this.auditInviteAction(actor, invite.id, params.employeeId ? 'existing_employee_link_created' : 'new_employee_invite_created', {
      employeeId: params.employeeId ?? null,
      companyId: params.companyId,
      additionalCompanyIds: params.presetJson?.additionalCompanyIds ?? [],
      teamId: params.presetJson?.teamId ?? null,
      expiresAt: expiresAt.toISOString(),
    });

    if (params.employeeId) {
      void this.onboardingTimeline?.recordIfNew(params.employeeId, 'invitation_created', actor.userId, {
        invitationId: invite.id,
      });
    }

    return {
      inviteId: invite.id,
      inviteLink: await this.buildInviteLink(rawToken),
      rawToken,
      expiresAt,
      status: invite.status,
    };
  }

  async bulkCreate(actor: ActorContext, employeeIds: string[], companyId: string) {
    const results: CreateInviteResult[] = [];
    for (const employeeId of employeeIds) {
      try {
        results.push(await this.createInvite(actor, employeeId, companyId));
      } catch {
        // skip employees that cannot receive invite
      }
    }
    return { created: results.length, invites: results };
  }

  async listInvites(
    scopeWhere: Prisma.EmployeeTelegramInviteWhereInput,
    filters: {
      status?: EmployeeTelegramInviteStatus;
      limit?: number;
      offset?: number;
    },
  ) {
    const where: Prisma.EmployeeTelegramInviteWhereInput = {
      ...scopeWhere,
      ...(filters.status ? { status: filters.status } : {}),
    };

    const [rows, total] = await Promise.all([
      this.prisma.employeeTelegramInvite.findMany({
        where,
        include: {
          employee: { select: { id: true, globalId: true, firstName: true, lastName: true, nickname: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: filters.limit ?? 50,
        skip: filters.offset ?? 0,
      }),
      this.prisma.employeeTelegramInvite.count({ where }),
    ]);

    const employeeIds = rows.map((r) => r.employeeId).filter((id): id is string => Boolean(id));
    const submissions = employeeIds.length
      ? await this.prisma.employeeSelfOnboardingSubmission.findMany({
        where: { employeeId: { in: employeeIds } },
        orderBy: { createdAt: 'desc' },
      })
      : [];
    const submissionByEmployee = new Map<string, typeof submissions[number]>();
    for (const s of submissions) {
      if (!submissionByEmployee.has(s.employeeId)) submissionByEmployee.set(s.employeeId, s);
    }

    const creatorIds = [...new Set(rows.map((r) => r.createdBy).filter((id): id is string => Boolean(id)))];
    const creators = creatorIds.length
      ? await this.prisma.user.findMany({
        where: { id: { in: creatorIds } },
        include: { employee: { select: { firstName: true, lastName: true } } },
      })
      : [];
    const creatorNameById = new Map(
      creators.map((u) => [
        u.id,
        u.employee ? `${u.employee.firstName} ${u.employee.lastName}`.trim() : u.username,
      ]),
    );

    const teamIds = [...new Set(rows.map((r) => {
      const preset = (r.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
      return preset.teamId;
    }).filter((id): id is string => Boolean(id)))];
    const teams = teamIds.length
      ? await this.prisma.team.findMany({ where: { id: { in: teamIds }, deletedAt: null }, select: { id: true, name: true } })
      : [];
    const teamNameById = new Map(teams.map((t) => [t.id, t.name]));

    const deptIds = [...new Set(rows.map((r) => {
      const preset = (r.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
      return preset.departmentId;
    }).filter((id): id is string => Boolean(id)))];
    const functions = deptIds.length
      ? await this.prisma.function.findMany({ where: { id: { in: deptIds }, deletedAt: null }, select: { id: true, name: true } })
      : [];
    const deptNameById = new Map(functions.map((f) => [f.id, f.name]));

    const items = rows.map((invite) => {
      const preset = (invite.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
      const submission = invite.employeeId ? submissionByEmployee.get(invite.employeeId) : undefined;
      const data = (submission?.submittedDataJson ?? {}) as Record<string, string | undefined>;
      const submittedName = data.fullName
        ?? (data.firstName && data.lastName ? `${data.firstName} ${data.lastName}` : null)
        ?? (invite.employee ? `${invite.employee.firstName} ${invite.employee.lastName}`.trim() : null);

      const approvedAt = submission?.status === 'approved' ? submission.reviewedAt : null;
      const rejectedAt = submission?.status === 'rejected' ? submission.reviewedAt : null;

      return {
        id: invite.id,
        inviteType: invite.employeeId ? 'existing_employee' : 'new_employee',
        inviteTypeLabel: invite.employeeId ? 'พนักงานเดิม' : 'พนักงานใหม่',
        submittedName,
        companyId: invite.companyId,
        companyName: invite.company?.name ?? null,
        departmentName: preset.department
          ?? (preset.departmentId ? deptNameById.get(preset.departmentId) ?? null : null),
        teamName: preset.teamId ? teamNameById.get(preset.teamId) ?? null : null,
        businessRole: preset.businessRole ?? null,
        status: invite.status,
        startedAt: ['started', 'used'].includes(invite.status) ? invite.updatedAt : null,
        submittedAt: submission?.submittedAt ?? null,
        approvedAt,
        rejectedAt,
        expiresAt: invite.expiresAt,
        createdAt: invite.createdAt,
        createdByName: invite.createdBy ? creatorNameById.get(invite.createdBy) ?? null : null,
        employeeId: invite.employeeId,
        employeeLabel: invite.employee
          ? `${invite.employee.globalId} — ${invite.employee.firstName} ${invite.employee.lastName}`
          : null,
        usedTelegramUsername: invite.usedTelegramUsername,
        canCopyLink: false,
        copyLinkHint: ['pending', 'started'].includes(invite.status)
          ? 'ต้อง Regenerate เพื่อคัดลอกลิงก์ใหม่'
          : null,
        tokenPreview: invite.tokenPreview,
        submissionId: submission?.status === 'submitted' ? submission.id : null,
        submissionStatus: submission?.status ?? null,
        canApprove: submission?.status === 'submitted',
        canRegenerate:
          ['pending', 'started'].includes(invite.status)
          || (
            invite.status === 'cancelled'
            && Boolean(invite.employeeId)
            && submission?.status !== 'approved'
            && submission?.status !== 'submitted'
          ),
      };
    });

    return { items, total };
  }

  async listByEmployee(employeeId: string) {
    return this.prisma.employeeTelegramInvite.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async cancelInvite(actor: ActorContext, inviteId: string, reason?: string) {
    const invite = await this.prisma.employeeTelegramInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');
    if (!['pending', 'started'].includes(invite.status)) {
      throw new BadRequestException('Only active invites can be cancelled');
    }

    await this.prisma.employeeTelegramInvite.update({
      where: { id: inviteId },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
        cancellationReason: reason ?? null,
      },
    });

    await this.auditInviteAction(actor, inviteId, 'invite_cancelled', {
      reason: reason ?? null,
      companyId: invite.companyId,
      targetEmployeeId: invite.employeeId,
    });

    return { ok: true };
  }

  async consumeInvite(params: {
    rawToken: string;
    profile: TelegramProfile;
    telegramAccountId: string;
    pendingUserId: string;
    chatId: number;
  }): Promise<{ employeeId: string; companyId: string }> {
    const tokenHash = this.hashToken(params.rawToken);
    const invite = await this.prisma.employeeTelegramInvite.findFirst({
      where: { tokenHash },
      include: { employee: true },
    });

    if (!invite) {
      throw new BadRequestException('ลิงก์ไม่ถูกต้อง');
    }
    if (invite.status === 'used') {
      throw new BadRequestException('ลิงก์นี้ถูกใช้งานแล้ว');
    }
    if (invite.status === 'cancelled') {
      throw new BadRequestException('ลิงก์ถูกยกเลิกแล้ว');
    }
    if (invite.status === 'expired' || invite.expiresAt < new Date()) {
      await this.prisma.employeeTelegramInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('ลิงก์หมดอายุแล้ว กรุณาติดต่อ HR เพื่อขอลิงก์ใหม่');
    }

    if (invite.status === 'started') {
      if (invite.usedTelegramUserId === BigInt(params.profile.telegramUserId) && invite.employeeId) {
        return { employeeId: invite.employeeId, companyId: invite.companyId };
      }
      throw new BadRequestException('ลิงก์นี้ถูกใช้งานแล้ว');
    }

    const employeeId = await this.ensureEmployeeForInvite(invite, params.profile);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee || employee.employmentStatus === 'terminated') {
      throw new BadRequestException('พนักงานไม่สามารถเชื่อมต่อได้');
    }

    const existingIdentity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, status: 'ACTIVE', deletedAt: null },
    });
    if (existingIdentity) {
      throw new BadRequestException('บัญชีนี้เชื่อมกับระบบแล้ว');
    }

    await this.clearIncompleteTelegramBinding(params.profile.telegramUserId, employeeId);

    await this.identities.linkViaInviteLink({
      employee,
      profile: params.profile,
      telegramAccountId: params.telegramAccountId,
      pendingUserId: params.pendingUserId,
    });

    await this.prisma.$transaction([
      this.prisma.employeeTelegramInvite.update({
        where: { id: invite.id },
        data: {
          status: 'started',
          usedAt: new Date(),
          usedTelegramUserId: BigInt(params.profile.telegramUserId),
          usedTelegramChatId: BigInt(params.chatId),
          usedTelegramUsername: params.profile.username ?? null,
          employeeId,
        },
      }),
      this.prisma.employeeTelegramInvite.updateMany({
        where: {
          employeeId,
          status: 'pending',
          id: { not: invite.id },
        },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancellationReason: 'Employee started invite onboarding',
        },
      }),
    ]);

    await this.audit.record(
      { userId: params.pendingUserId, impersonatorUserId: null, companyId: invite.companyId },
      {
        entityType: 'EmployeeTelegramInvite',
        entityId: invite.id,
        action: 'telegram_invite_started',
        after: { employeeId, telegramUserId: params.profile.telegramUserId },
      },
    );

    void this.onboardingTimeline?.recordIfNew(employeeId, 'invitation_started', params.pendingUserId, {
      invitationId: invite.id,
    });

    return { employeeId, companyId: invite.companyId };
  }

  private async ensureEmployeeForInvite(
    invite: { id: string; employeeId: string | null; companyId: string; presetJson: unknown },
    profile: TelegramProfile,
  ): Promise<string> {
    if (invite.employeeId) return invite.employeeId;

    const preset = (invite.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
    const globalId = await this.globalIds.allocate();
    const employeeId = randomUUID();
    const firstName = profile.firstName?.trim() || 'รอ';
    const lastName = profile.lastName?.trim() || 'ลงทะเบียน';

    const orgContext = await resolvePresetOrgContext(this.prisma, preset);
    const employeeData = buildEmployeeUpdateFromPreset(preset, orgContext.departmentName);
    const workCategory = mapWorkLocationToCategory(preset.workLocation);
    const companyIds = allPresetCompanyIds({ ...preset, companyId: preset.companyId || invite.companyId });
    const hireDate = preset.startDate ? new Date(preset.startDate) : new Date();
    const resolved = resolveInitialEmploymentFromType(preset.employmentType);
    const probationEndDate = resolved.employmentStatus === 'probation'
      ? defaultProbationEndDate(hireDate)
      : null;

    await this.prisma.$transaction(async (tx) => {
      await tx.employee.create({
        data: {
          id: employeeId,
          globalId: globalId.value,
          firstName,
          lastName,
          employmentStatus: resolved.employmentStatus,
          employmentType: resolved.employmentType,
          probationEndDate,
          workCategory: workCategory ?? 'office',
          hireDate,
          ...employeeData,
          createdBy: null,
          updatedBy: null,
        },
      });
      for (let i = 0; i < companyIds.length; i += 1) {
        const targetCompanyId = companyIds[i];
        const isPrimary = i === 0;
        const companyAssignment = presetAssignmentForCompany(preset, targetCompanyId);
        const companyOrg = await resolveCompanyOrgContext(tx, companyAssignment);
        await tx.employeeAssignment.create({
          data: {
            id: randomUUID(),
            employeeId,
            companyId: targetCompanyId,
            teamId: companyAssignment.teamId ?? null,
            functionId: companyOrg.functionId,
            roleLevel: mapBusinessRoleToRoleLevel(preset.businessRole),
            effectiveFrom: preset.startDate ? new Date(preset.startDate) : new Date(),
            isPrimaryCompany: isPrimary,
            isPrimaryTeam: isPrimary && Boolean(companyAssignment.teamId),
            createdBy: null,
            updatedBy: null,
          },
        });
      }
      await tx.employeeTelegramInvite.update({
        where: { id: invite.id },
        data: { employeeId },
      });
    });

    return employeeId;
  }

  async resolveTelegramConnectionStatus(employeeId: string): Promise<TelegramConnectionStatus> {
    return resolveTelegramConnectionStatus(this.prisma, employeeId);
  }

  async getTelegramUserOnboardingStatus(telegramUserId: number): Promise<{
    status: TelegramConnectionStatus;
    message: string;
  }> {
    const identity = await this.prisma.telegramIdentity.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
      orderBy: { linkedAt: 'desc' },
    });

    if (!identity) {
      const pendingRequest = await this.prisma.registrationRequest.findFirst({
        where: { telegramUserId: BigInt(telegramUserId), requestStatus: 'PENDING' },
        orderBy: { createdAt: 'desc' },
      });
      if (pendingRequest) {
        return {
          status: 'pending_review',
          message: '⏳ คำขอถูกส่งให้ HR ตรวจสอบแล้ว',
        };
      }
      return {
        status: 'not_connected',
        message: 'ยังไม่มีคำขอลงทะเบียน กรุณากดลิงก์เชิญจาก HR',
      };
    }

    const connectionStatus = await this.resolveTelegramConnectionStatus(identity.employeeId);

    const messages: Record<TelegramConnectionStatus, string> = {
      not_connected: 'ยังไม่มีคำขอลงทะเบียน กรุณากดลิงก์เชิญจาก HR',
      invite_sent: 'ยังไม่มีคำขอลงทะเบียน กรุณากดลิงก์เชิญจาก HR',
      started: 'กำลังกรอกข้อมูลลงทะเบียน\n\nพิมพ์ /start เพื่อเริ่มกรอกต่อ\nหรือกดลิงก์เชิญจาก HR อีกครั้ง',
      onboarding_submitted: '⏳ คำขอถูกส่งให้ HR ตรวจสอบแล้ว',
      pending_review: '⏳ คำขอถูกส่งให้ HR ตรวจสอบแล้ว',
      linked: '✅ ลงทะเบียนสำเร็จ เชื่อมต่อแล้ว',
      rejected: '❌ คำขอไม่ผ่านการอนุมัติ กรุณาติดต่อ HR',
      expired: 'ลิงก์เชิญหมดอายุ กรุณาขอลิงก์ใหม่จาก HR',
    };

    return { status: connectionStatus, message: messages[connectionStatus] };
  }

  async getEmployeeTelegramStatus(employeeId: string): Promise<TelegramConnectionStatus> {
    return this.resolveTelegramConnectionStatus(employeeId);
  }

  async employeeNeedsSelfOnboarding(employeeId: string): Promise<boolean> {
    const approved = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId, status: 'approved' },
    });
    if (approved) return false;

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { employmentStatus: true, phone: true, hireDate: true },
    });
    if (!employee) return true;

    const status = employee.employmentStatus?.toLowerCase();
    return !((status === 'active' || status === 'draft') && employee.phone && employee.hireDate);
  }

  async getInviteDetail(inviteId: string) {
    const invite = await this.prisma.employeeTelegramInvite.findUnique({
      where: { id: inviteId },
      include: {
        employee: {
          select: {
            id: true, globalId: true, firstName: true, lastName: true, nickname: true, phone: true,
          },
        },
        company: { select: { id: true, name: true } },
      },
    });
    if (!invite) throw new NotFoundException('Invite not found');

    const preset = (invite.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
    const submission = invite.employeeId
      ? await this.prisma.employeeSelfOnboardingSubmission.findFirst({
        where: { employeeId: invite.employeeId },
        orderBy: { createdAt: 'desc' },
      })
      : null;

    let teamName: string | null = null;
    let departmentName: string | null = null;
    if (preset.teamId) {
      const team = await this.prisma.marketingTeam.findUnique({
        where: { id: preset.teamId },
        select: { name: true },
      });
      teamName = team?.name ?? null;
    }
    if (preset.departmentId) {
      const fn = await this.prisma.function.findFirst({
        where: { id: preset.departmentId, deletedAt: null },
        select: { name: true },
      });
      departmentName = fn?.name ?? null;
    }

    let createdByName: string | null = null;
    if (invite.createdBy) {
      const user = await this.prisma.user.findUnique({
        where: { id: invite.createdBy },
        include: { employee: { select: { firstName: true, lastName: true } } },
      });
      createdByName = user?.employee
        ? `${user.employee.firstName} ${user.employee.lastName}`.trim()
        : user?.username ?? null;
    }

    return {
      ...invite,
      inviteType: invite.employeeId ? 'existing_employee' : 'new_employee',
      preset,
      teamName,
      departmentName,
      businessRole: preset.businessRole ?? null,
      createdByName,
      submission: submission
        ? {
          id: submission.id,
          status: submission.status,
          submittedAt: submission.submittedAt,
          submittedDataJson: submission.submittedDataJson,
        }
        : null,
      canCopyLink: false,
      copyLinkHint: invite.status === 'pending' ? 'ต้อง Regenerate เพื่อคัดลอกลิงก์ใหม่' : null,
    };
  }

  async regenerateByInviteId(actor: ActorContext, inviteId: string) {
    const invite = await this.prisma.employeeTelegramInvite.findUnique({ where: { id: inviteId } });
    if (!invite) throw new NotFoundException('Invite not found');

    if (invite.employeeId) {
      await this.resetStuckTelegramOnboarding(actor, invite.employeeId);
    }

    if (['pending', 'started'].includes(invite.status)) {
      await this.prisma.employeeTelegramInvite.update({
        where: { id: inviteId },
        data: {
          status: 'cancelled',
          cancelledAt: new Date(),
          cancelledBy: actor.userId,
          cancellationReason: 'Superseded by regenerate',
        },
      });
    }

    const preset = (invite.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
    if (invite.employeeId) {
      const result = await this.createInvite(actor, invite.employeeId, invite.companyId);
      await this.auditInviteAction(actor, result.inviteId, 'invite_regenerated', {
        companyId: invite.companyId,
        targetEmployeeId: invite.employeeId,
        previousInviteId: inviteId,
      });
      return {
        inviteId: result.inviteId,
        inviteLink: result.inviteLink,
        token: result.rawToken,
        expiresAt: result.expiresAt,
        status: result.status,
      };
    }

    const result = await this.createNewEmployeeInvite(actor, {
      companyId: invite.companyId,
      businessRole: preset.businessRole ?? 'employee',
      employmentType: preset.employmentType ?? 'full_time',
      startDate: preset.startDate ?? new Date().toISOString().slice(0, 10),
      teamId: preset.teamId,
      position: preset.position,
      shiftId: preset.shiftId,
      workLocation: preset.workLocation,
      note: preset.note,
    });
    await this.auditInviteAction(actor, result.inviteId, 'invite_regenerated', {
      companyId: invite.companyId,
      targetEmployeeId: invite.employeeId,
      previousInviteId: inviteId,
    });
    return {
      inviteId: result.inviteId,
      inviteLink: result.inviteLink,
      token: result.rawToken,
      expiresAt: result.expiresAt,
      status: result.status,
    };
  }

  async recordInviteViewed(actor: ActorContext, inviteId: string): Promise<void> {
    const invite = await this.prisma.employeeTelegramInvite.findUnique({ where: { id: inviteId } });
    if (!invite) return;
    const preset = (invite.presetJson ?? {}) as unknown as InvitationEmploymentPreset;
    await this.auditInviteAction(actor, inviteId, 'invite_viewed', {
      companyId: invite.companyId,
      teamId: preset.teamId ?? null,
      targetEmployeeId: invite.employeeId,
    });
  }

  private async clearIncompleteTelegramBinding(
    telegramUserId: number,
    targetEmployeeId: string,
  ): Promise<void> {
    const existing = await this.prisma.telegramIdentity.findFirst({
      where: {
        telegramUserId: BigInt(telegramUserId),
        status: 'PENDING',
        deletedAt: null,
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!existing || existing.employeeId === targetEmployeeId) return;

    const submitted = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
      where: { employeeId: existing.employeeId, status: 'submitted' },
    });
    if (submitted) {
      throw new BadRequestException('บัญชี Telegram นี้มีคำขอรอ HR อนุมัติอยู่แล้ว');
    }

    await this.prisma.telegramIdentity.update({
      where: { id: existing.id },
      data: { status: 'REVOKED' },
    });
    await this.prisma.employeeTelegramInvite.updateMany({
      where: { employeeId: existing.employeeId, status: { in: ['pending', 'started'] } },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancellationReason: 'Superseded by new invite link',
      },
    });
  }

  private async auditInviteAction(
    actor: ActorContext,
    invitationId: string,
    action: string,
    extras: Record<string, unknown>,
  ): Promise<void> {
    const access = await this.businessPermissions.findUserAccess(actor.userId);
    await this.audit.record(actor, {
      entityType: 'EmployeeTelegramInvite',
      entityId: invitationId,
      action,
      after: {
        actorId: actor.userId,
        actorRole: access?.businessRole ?? null,
        actorScope: access?.scopes ?? [],
        invitationId,
        timestamp: new Date().toISOString(),
        ...extras,
      },
    });
  }
}
