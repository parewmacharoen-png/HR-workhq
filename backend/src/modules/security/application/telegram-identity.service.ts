// ============================================================================
// modules/security/application/telegram-identity.service.ts
// ============================================================================

import { Injectable, Inject, Optional, forwardRef, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  RegistrationRequestStatus,
  TelegramIdentityStatus,
  TelegramVerificationMethod,
} from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext, SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import {
  normalizePhone,
  phonesMatch,
  RegistrationRequestView,
  TelegramAccessState,
  TelegramIdentityView,
  TelegramProfile,
} from '../domain/telegram-identity.types';
import {
  EmployeeAlreadyLinkedError,
  RegistrationRequestNotFoundError,
  RegistrationRequestNotPendingError,
  TelegramAccessDeniedError,
  TelegramAlreadyLinkedError,
  TelegramIdentityNotFoundError,
} from '../domain/errors/security.errors';
import type { TelegramRegistrationRequestBridgeService } from '../../request/application/telegram-registration-request-bridge.service';
import { TELEGRAM_REGISTRATION_REQUEST_BRIDGE } from '../../request/application/telegram-registration-request-bridge.token';
import { OperatorTelegramInviteService } from '../../permission/application/operator-telegram-invite.service';

export interface VerifyEmployeeInput {
  employeeCode: string;
  phone: string;
  profile: TelegramProfile;
  telegramAccountId: string;
  pendingUserId: string;
}

export interface VerifyInviteInput {
  inviteCode: string;
  phone: string;
  profile: TelegramProfile;
  telegramAccountId: string;
  pendingUserId: string;
}

@Injectable()
export class TelegramIdentityService {
  private readonly logger = new Logger(TelegramIdentityService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() @Inject(TELEGRAM_REGISTRATION_REQUEST_BRIDGE)
    private readonly registrationBridge?: TelegramRegistrationRequestBridgeService,
    @Optional() private readonly operatorInvites?: OperatorTelegramInviteService,
  ) {}

  async getAccessState(telegramUserId: number): Promise<TelegramAccessState> {
    const identity = await this.findLatestIdentity(telegramUserId);
    if (!identity) {
      return this.legacyAccessState(telegramUserId);
    }
    if (identity.status === 'REVOKED') return 'revoked';
    if (identity.status === 'PENDING') return 'pending';
    if (identity.status === 'ACTIVE') {
      const employee = await this.prisma.employee.findFirst({
        where: { id: identity.employeeId, deletedAt: null },
        select: { employmentStatus: true },
      });
      if (!employee || employee.employmentStatus === 'terminated') return 'revoked';
      return 'active';
    }
    return 'unverified';
  }

  async touchLastSeen(telegramUserId: number): Promise<void> {
    await this.prisma.telegramIdentity.updateMany({
      where: {
        telegramUserId: BigInt(telegramUserId),
        status: 'ACTIVE',
        deletedAt: null,
      },
      data: { lastSeenAt: new Date() },
    });
  }

  async verifyEmployeeCodeAndPhone(input: VerifyEmployeeInput): Promise<'approved' | 'pending'> {
    const code = input.employeeCode.trim().toUpperCase();
    const employee = await this.prisma.employee.findFirst({
      where: { globalId: code, deletedAt: null },
    });
    if (!employee || employee.employmentStatus === 'terminated') {
      await this.createPendingRequest({
        employeeId: null,
        profile: input.profile,
        method: 'employee_code_phone',
        submittedEmployeeCode: code,
        submittedPhone: input.phone,
      });
      return 'pending';
    }
    if (!phonesMatch(employee.phone, input.phone)) {
      await this.createPendingRequest({
        employeeId: employee.id,
        profile: input.profile,
        method: 'employee_code_phone',
        submittedEmployeeCode: code,
        submittedPhone: input.phone,
      });
      return 'pending';
    }
    await this.activateIdentity({
      employee,
      profile: input.profile,
      telegramAccountId: input.telegramAccountId,
      pendingUserId: input.pendingUserId,
      method: 'employee_code_phone',
    });
    return 'approved';
  }

  async linkViaInviteLink(params: {
    employee: { id: string; phone: string | null; firstName: string; lastName: string };
    profile: TelegramProfile;
    telegramAccountId: string;
    pendingUserId: string;
  }): Promise<void> {
    await this.linkViaInviteLinkPending(params);
  }

  async linkViaInviteLinkPending(params: {
    employee: { id: string; phone: string | null; firstName: string; lastName: string };
    profile: TelegramProfile;
    telegramAccountId: string;
    pendingUserId: string;
  }): Promise<void> {
    const existingEmployeeIdentity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId: params.employee.id, status: { in: ['ACTIVE', 'PENDING'] }, deletedAt: null },
    });
    if (existingEmployeeIdentity
      && existingEmployeeIdentity.telegramUserId !== BigInt(params.profile.telegramUserId)) {
      throw new EmployeeAlreadyLinkedError();
    }

    const existingTelegramIdentity = await this.prisma.telegramIdentity.findFirst({
      where: {
        telegramUserId: BigInt(params.profile.telegramUserId),
        status: { in: ['ACTIVE', 'PENDING'] },
        deletedAt: null,
      },
    });
    if (existingTelegramIdentity && existingTelegramIdentity.employeeId !== params.employee.id) {
      throw new TelegramAlreadyLinkedError();
    }

    const linkedUserId = await this.linkUserToEmployee({
      employeeId: params.employee.id,
      phone: params.employee.phone,
      pendingUserId: params.pendingUserId,
      telegramAccountId: params.telegramAccountId,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramIdentity.updateMany({
        where: {
          OR: [
            { employeeId: params.employee.id, status: { in: ['ACTIVE', 'PENDING'] }, deletedAt: null },
            { telegramUserId: BigInt(params.profile.telegramUserId), status: { in: ['ACTIVE', 'PENDING'] }, deletedAt: null },
          ],
        },
        data: { status: 'REVOKED' },
      });

      await tx.telegramIdentity.create({
        data: {
          id: randomUUID(),
          employeeId: params.employee.id,
          telegramUserId: BigInt(params.profile.telegramUserId),
          telegramUsername: params.profile.username ?? null,
          telegramFirstName: params.profile.firstName ?? null,
          telegramLastName: params.profile.lastName ?? null,
          status: 'PENDING',
          linkedAt: new Date(),
          createdBy: linkedUserId,
        },
      });

      await tx.telegramAccount.update({
        where: { id: params.telegramAccountId },
        data: { userId: linkedUserId, username: params.profile.username ?? undefined },
      });
    });

    await this.audit.record(
      { userId: linkedUserId, impersonatorUserId: null, companyId: null },
      {
        entityType: 'TelegramIdentity',
        entityId: params.employee.id,
        action: 'identity_linked_pending',
        after: { telegramUserId: params.profile.telegramUserId, method: 'invite_link' },
      },
    );
  }

  async promotePendingToActive(actor: ActorContext, employeeId: string, telegramUserId: number): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
    });
    if (!employee) throw new TelegramIdentityNotFoundError();

    const account = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
    });
    if (!account) throw new TelegramIdentityNotFoundError();

    await this.activateIdentity({
      employee,
      profile: { telegramUserId, username: account.username },
      telegramAccountId: account.id,
      pendingUserId: account.userId,
      method: 'manual',
      actor,
    });
  }

  async verifyInviteCodeAndPhone(input: VerifyInviteInput): Promise<'approved' | 'pending'> {
    const invite = input.inviteCode.trim();
    const employee = await this.prisma.employee.findFirst({
      where: { inviteCode: invite, deletedAt: null },
    });
    if (!employee || employee.employmentStatus === 'terminated') {
      await this.createPendingRequest({
        employeeId: null,
        profile: input.profile,
        method: 'invite_code_phone',
        submittedInviteCode: invite,
        submittedPhone: input.phone,
      });
      return 'pending';
    }
    if (!phonesMatch(employee.phone, input.phone)) {
      await this.createPendingRequest({
        employeeId: employee.id,
        profile: input.profile,
        method: 'invite_code_phone',
        submittedInviteCode: invite,
        submittedPhone: input.phone,
      });
      return 'pending';
    }
    await this.activateIdentity({
      employee,
      profile: input.profile,
      telegramAccountId: input.telegramAccountId,
      pendingUserId: input.pendingUserId,
      method: 'invite_code_phone',
    });
    return 'approved';
  }

  async getIdentityForEmployee(employeeId: string): Promise<TelegramIdentityView | null> {
    const row = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, deletedAt: null },
      orderBy: [{ status: 'asc' }, { linkedAt: 'desc' }],
    });
    return row ? this.toIdentityView(row) : null;
  }

  async listIdentities(query: {
    status?: TelegramIdentityStatus;
    search?: string;
    limit?: number;
    offset?: number;
  }): Promise<TelegramIdentityView[]> {
    const where: Record<string, unknown> = { deletedAt: null };
    if (query.status) where.status = query.status;
    if (query.search?.trim()) {
      const term = query.search.trim();
      where.OR = [
        { telegramUsername: { contains: term, mode: 'insensitive' } },
        { employee: { globalId: { contains: term.toUpperCase(), mode: 'insensitive' } } },
        { employee: { firstName: { contains: term, mode: 'insensitive' } } },
        { employee: { lastName: { contains: term, mode: 'insensitive' } } },
      ];
    }
    const rows = await this.prisma.telegramIdentity.findMany({
      where,
      orderBy: { linkedAt: 'desc' },
      take: query.limit ?? 50,
      skip: query.offset ?? 0,
    });
    return rows.map((r) => this.toIdentityView(r));
  }

  async listRegistrationRequests(status?: RegistrationRequestStatus): Promise<RegistrationRequestView[]> {
    const rows = await this.prisma.registrationRequest.findMany({
      where: status ? { requestStatus: status } : undefined,
      include: {
        employee: { select: { globalId: true, firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map((r) => ({
      id: r.id,
      employeeId: r.employeeId,
      employeeGlobalId: r.employee?.globalId ?? null,
      employeeName: r.employee ? `${r.employee.firstName} ${r.employee.lastName}` : null,
      telegramUserId: r.telegramUserId.toString(),
      telegramUsername: r.telegramUsername,
      requestStatus: r.requestStatus,
      verificationMethod: r.verificationMethod,
      rejectionReason: r.rejectionReason,
      submittedEmployeeCode: r.submittedEmployeeCode,
      submittedPhone: r.submittedPhone,
      submittedInviteCode: r.submittedInviteCode,
      createdAt: r.createdAt.toISOString(),
      approvedAt: r.approvedAt?.toISOString() ?? null,
      approvedBy: r.approvedBy,
    }));
  }

  async approveRegistration(actor: ActorContext, requestId: string, employeeId?: string): Promise<void> {
    const request = await this.prisma.registrationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new RegistrationRequestNotFoundError(requestId);
    if (request.requestStatus !== 'PENDING') throw new RegistrationRequestNotPendingError();

    const targetEmployeeId = employeeId ?? request.employeeId;
    if (!targetEmployeeId) throw new RegistrationRequestNotFoundError(requestId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: targetEmployeeId, deletedAt: null },
    });
    if (!employee || employee.employmentStatus === 'terminated') {
      throw new RegistrationRequestNotFoundError(requestId);
    }

    const account = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: request.telegramUserId, deletedAt: null },
    });
    if (!account) throw new RegistrationRequestNotFoundError(requestId);

    await this.activateIdentity({
      employee,
      profile: {
        telegramUserId: Number(request.telegramUserId),
        username: request.telegramUsername,
      },
      telegramAccountId: account.id,
      pendingUserId: account.userId,
      method: 'manual',
      actor,
      registrationRequestId: request.id,
    });

    await this.audit.record(actor, {
      entityType: 'RegistrationRequest',
      entityId: requestId,
      action: 'registration_approved',
      after: { employeeId: targetEmployeeId },
    });
  }

  async rejectRegistration(actor: ActorContext, requestId: string, reason: string): Promise<void> {
    const request = await this.prisma.registrationRequest.findUnique({ where: { id: requestId } });
    if (!request) throw new RegistrationRequestNotFoundError(requestId);
    if (request.requestStatus !== 'PENDING') throw new RegistrationRequestNotPendingError();

    await this.prisma.registrationRequest.update({
      where: { id: requestId },
      data: {
        requestStatus: 'REJECTED',
        rejectionReason: reason,
        approvedAt: new Date(),
        approvedBy: actor.userId,
      },
    });

    await this.prisma.telegramIdentity.updateMany({
      where: {
        telegramUserId: request.telegramUserId,
        status: 'PENDING',
        deletedAt: null,
      },
      data: { status: 'REVOKED', updatedBy: actor.userId },
    });

    await this.audit.record(actor, {
      entityType: 'RegistrationRequest',
      entityId: requestId,
      action: 'registration_rejected',
      after: { reason },
    });
  }

  async revokeAccess(actor: ActorContext, employeeId: string): Promise<void> {
    const identity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, status: 'ACTIVE', deletedAt: null },
    });
    if (!identity) throw new TelegramIdentityNotFoundError();

    await this.prisma.telegramIdentity.update({
      where: { id: identity.id },
      data: { status: 'REVOKED', updatedBy: actor.userId },
    });

    await this.audit.record(actor, {
      entityType: 'TelegramIdentity',
      entityId: identity.id,
      action: 'identity_revoked',
      before: { status: 'ACTIVE' },
      after: { status: 'REVOKED' },
    });
  }

  async resetBinding(actor: ActorContext, employeeId: string): Promise<void> {
    const identities = await this.prisma.telegramIdentity.findMany({
      where: { employeeId, deletedAt: null, status: { in: ['ACTIVE', 'PENDING'] } },
    });
    for (const identity of identities) {
      await this.prisma.telegramIdentity.update({
        where: { id: identity.id },
        data: { status: 'REVOKED', updatedBy: actor.userId },
      });
    }

    await this.audit.record(actor, {
      entityType: 'TelegramIdentity',
      entityId: employeeId,
      action: 'identity_reset',
      after: { revokedCount: identities.length },
    });
  }

  async reactivateAccess(actor: ActorContext, employeeId: string): Promise<void> {
    const identity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId, status: 'REVOKED', deletedAt: null },
      orderBy: { linkedAt: 'desc' },
    });
    if (!identity) throw new TelegramIdentityNotFoundError();

    const otherActive = await this.prisma.telegramIdentity.findFirst({
      where: {
        telegramUserId: identity.telegramUserId,
        status: 'ACTIVE',
        deletedAt: null,
        id: { not: identity.id },
      },
    });
    if (otherActive) throw new TelegramAlreadyLinkedError();

    await this.prisma.telegramIdentity.update({
      where: { id: identity.id },
      data: { status: 'ACTIVE', updatedBy: actor.userId, linkedAt: new Date() },
    });

    await this.audit.record(actor, {
      entityType: 'TelegramIdentity',
      entityId: identity.id,
      action: 'identity_reactivated',
      before: { status: 'REVOKED' },
      after: { status: 'ACTIVE' },
    });
  }

  async assertActiveForTelegramUser(telegramUserId: number): Promise<void> {
    const state = await this.getAccessState(telegramUserId);
    if (state === 'revoked') {
      throw new TelegramAccessDeniedError(
        'Your account access has been revoked. Please contact HR.',
      );
    }
    if (state !== 'active') {
      throw new TelegramAccessDeniedError('Telegram identity verification required');
    }
  }

  async assertActiveForUserTelegram(userId: string): Promise<void> {
    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId, deletedAt: null, telegramUserId: { gt: 0 } },
    });
    if (!account) return;
    await this.assertActiveForTelegramUser(Number(account.telegramUserId));
  }

  private async activateIdentity(params: {
    employee: { id: string; phone: string | null; firstName: string; lastName: string };
    profile: TelegramProfile;
    telegramAccountId: string;
    pendingUserId: string;
    method: TelegramVerificationMethod;
    actor?: ActorContext;
    registrationRequestId?: string;
  }): Promise<void> {
    const existingEmployeeIdentity = await this.prisma.telegramIdentity.findFirst({
      where: { employeeId: params.employee.id, status: 'ACTIVE', deletedAt: null },
    });
    if (existingEmployeeIdentity
      && existingEmployeeIdentity.telegramUserId !== BigInt(params.profile.telegramUserId)) {
      throw new EmployeeAlreadyLinkedError();
    }

    const existingTelegramIdentity = await this.prisma.telegramIdentity.findFirst({
      where: {
        telegramUserId: BigInt(params.profile.telegramUserId),
        status: 'ACTIVE',
        deletedAt: null,
      },
    });
    if (existingTelegramIdentity && existingTelegramIdentity.employeeId !== params.employee.id) {
      throw new TelegramAlreadyLinkedError();
    }

    const linkedUserId = await this.linkUserToEmployee({
      employeeId: params.employee.id,
      phone: params.employee.phone,
      pendingUserId: params.pendingUserId,
      telegramAccountId: params.telegramAccountId,
    });

    await this.prisma.$transaction(async (tx) => {
      await tx.telegramIdentity.updateMany({
        where: {
          OR: [
            { employeeId: params.employee.id, status: { in: ['ACTIVE', 'PENDING'] }, deletedAt: null },
            { telegramUserId: BigInt(params.profile.telegramUserId), status: { in: ['ACTIVE', 'PENDING'] }, deletedAt: null },
          ],
        },
        data: { status: 'REVOKED' },
      });

      await tx.telegramIdentity.create({
        data: {
          id: randomUUID(),
          employeeId: params.employee.id,
          telegramUserId: BigInt(params.profile.telegramUserId),
          telegramUsername: params.profile.username ?? null,
          telegramFirstName: params.profile.firstName ?? null,
          telegramLastName: params.profile.lastName ?? null,
          status: 'ACTIVE',
          linkedAt: new Date(),
          lastSeenAt: new Date(),
          createdBy: params.actor?.userId ?? null,
        },
      });

      if (params.registrationRequestId) {
        await tx.registrationRequest.update({
          where: { id: params.registrationRequestId },
          data: {
            requestStatus: 'APPROVED',
            employeeId: params.employee.id,
            approvedAt: new Date(),
            approvedBy: params.actor?.userId ?? null,
          },
        });
      }

      await tx.telegramAccount.update({
        where: { id: params.telegramAccountId },
        data: { userId: linkedUserId, username: params.profile.username ?? undefined },
      });
    });

    if (params.actor) {
      await this.audit.record(params.actor, {
        entityType: 'TelegramIdentity',
        entityId: params.employee.id,
        action: 'identity_linked',
        after: { telegramUserId: params.profile.telegramUserId, method: params.method },
      });
    } else {
      await this.audit.record(
        { userId: linkedUserId, impersonatorUserId: null, companyId: null },
        {
          entityType: 'TelegramIdentity',
          entityId: params.employee.id,
          action: 'registration_auto_approved',
          after: { telegramUserId: params.profile.telegramUserId, method: params.method },
        },
      );
    }
  }

  private async linkUserToEmployee(params: {
    employeeId: string;
    phone: string | null;
    pendingUserId: string;
    telegramAccountId: string;
  }): Promise<string> {
    const existingUser = await this.prisma.user.findFirst({
      where: { employeeId: params.employeeId, deletedAt: null },
    });
    if (existingUser) {
      if (existingUser.id !== params.pendingUserId) {
        await this.prisma.telegramAccount.update({
          where: { id: params.telegramAccountId },
          data: { userId: existingUser.id },
        });
        await this.prisma.user.update({
          where: { id: params.pendingUserId },
          data: { deletedAt: new Date(), isActive: false },
        });
      }
      await this.prisma.user.update({
        where: { id: existingUser.id },
        data: { isActive: true },
      });
      return existingUser.id;
    }

    const username = params.phone?.replace(/\s/g, '') ?? `emp_${params.employeeId.slice(0, 8)}`;
    await this.prisma.user.update({
      where: { id: params.pendingUserId },
      data: {
        employeeId: params.employeeId,
        username,
        isActive: true,
      },
    });
    return params.pendingUserId;
  }

  private async createPendingRequest(params: {
    employeeId: string | null;
    profile: TelegramProfile;
    method: TelegramVerificationMethod;
    submittedEmployeeCode?: string;
    submittedPhone?: string;
    submittedInviteCode?: string;
  }): Promise<void> {
    const request = await this.prisma.registrationRequest.create({
      data: {
        id: randomUUID(),
        employeeId: params.employeeId,
        telegramUserId: BigInt(params.profile.telegramUserId),
        telegramUsername: params.profile.username ?? null,
        requestStatus: 'PENDING',
        verificationMethod: params.method,
        submittedEmployeeCode: params.submittedEmployeeCode ?? null,
        submittedPhone: params.submittedPhone ?? null,
        submittedInviteCode: params.submittedInviteCode ?? null,
      },
    });

    if (params.employeeId) {
      await this.prisma.telegramIdentity.create({
        data: {
          id: randomUUID(),
          employeeId: params.employeeId,
          telegramUserId: BigInt(params.profile.telegramUserId),
          telegramUsername: params.profile.username ?? null,
          status: 'PENDING',
        },
      });
    }

    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'RegistrationRequest',
      entityId: request.id,
      action: 'registration_requested',
      after: {
        method: params.method,
        employeeId: params.employeeId,
        telegramUserId: params.profile.telegramUserId,
      },
    });

    if (this.registrationBridge && params.employeeId) {
      const companyId = await this.registrationBridge.resolveCompanyId(params.employeeId);
      if (companyId) {
        const requestInstanceId = await this.registrationBridge.createAndSubmit({
          employeeId: params.employeeId,
          companyId,
          telegramUserId: params.profile.telegramUserId,
          verificationMethod: params.method,
          submittedEmployeeCode: params.submittedEmployeeCode,
          submittedPhone: params.submittedPhone,
          submittedInviteCode: params.submittedInviteCode,
          registrationRequestId: request.id,
          reviewReason: 'auto_confirm_failed',
        });
        if (!requestInstanceId) {
          this.logger.error(
            `Telegram registration request bridge failed for employee ${params.employeeId} — ` +
            'registration_requests row exists but Web Request was not submitted',
          );
        }
      } else {
        this.logger.warn(
          `No company assignment for employee ${params.employeeId} — skipping Web Request bridge`,
        );
      }
    } else if (params.employeeId && !this.registrationBridge) {
      this.logger.error('TelegramRegistrationRequestBridgeService not wired — Web Request not created');
    }
  }

  private async legacyAccessState(telegramUserId: number): Promise<TelegramAccessState> {
    const pendingRequest = await this.prisma.registrationRequest.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), requestStatus: 'PENDING' },
      orderBy: { createdAt: 'desc' },
    });
    if (pendingRequest) return 'pending';

    const account = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
      include: { user: { select: { isActive: true, employeeId: true } } },
    });
    if (!account?.user.isActive || !account.user.employeeId) {
      if (account?.user.isActive && !account.user.employeeId && this.operatorInvites) {
        const isOperator = await this.operatorInvites.isVerifiedOperator(account.userId);
        if (isOperator) return 'active';
      }
      return 'unverified';
    }
    const employee = await this.prisma.employee.findFirst({
      where: { id: account.user.employeeId, deletedAt: null },
      select: { employmentStatus: true },
    });
    if (!employee || employee.employmentStatus === 'terminated') return 'revoked';
    await this.backfillLegacyIdentity(account.user.employeeId, telegramUserId, account.username);
    return 'active';
  }

  private async backfillLegacyIdentity(
    employeeId: string,
    telegramUserId: number,
    username: string | null,
  ): Promise<void> {
    const existing = await this.prisma.telegramIdentity.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
    });
    if (existing) return;
    await this.prisma.telegramIdentity.create({
      data: {
        id: randomUUID(),
        employeeId,
        telegramUserId: BigInt(telegramUserId),
        telegramUsername: username,
        status: 'ACTIVE',
        linkedAt: new Date(),
        lastSeenAt: new Date(),
      },
    });
  }

  private async findLatestIdentity(telegramUserId: number) {
    return this.prisma.telegramIdentity.findFirst({
      where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
      orderBy: { linkedAt: 'desc' },
    });
  }

  private toIdentityView(row: {
    id: string;
    employeeId: string;
    telegramUserId: bigint;
    telegramUsername: string | null;
    telegramFirstName: string | null;
    telegramLastName: string | null;
    linkedAt: Date;
    lastSeenAt: Date | null;
    status: TelegramIdentityStatus;
  }): TelegramIdentityView {
    return {
      id: row.id,
      employeeId: row.employeeId,
      telegramUserId: row.telegramUserId.toString(),
      telegramUsername: row.telegramUsername,
      telegramFirstName: row.telegramFirstName,
      telegramLastName: row.telegramLastName,
      linkedAt: row.linkedAt.toISOString(),
      lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
      status: row.status,
    };
  }
}
