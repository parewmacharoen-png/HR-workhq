// ============================================================================
// Operator Telegram invite — back-office users without employee records.
// ============================================================================

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomBytes } from 'crypto';
import { OperatorTelegramInviteStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { TelegramHealthService } from '../../../common/monitoring/telegram-health.service';
import { BACKOFFICE_STAFF_ROLES } from '../domain/entities/backoffice-access-matrix';

const DEFAULT_EXPIRY_DAYS = 7;
const STAFF_ROLE_SET = new Set<string>(BACKOFFICE_STAFF_ROLES);

export type OperatorTelegramLinkStatus = 'NONE' | 'PENDING' | 'LINKED' | 'EXPIRED';

export interface OperatorTelegramLinkResponse {
  status: OperatorTelegramLinkStatus;
  deepLink: string | null;
  expiresAt: string | null;
  linkedAt: string | null;
  telegramUsername: string | null;
}

@Injectable()
export class OperatorTelegramInviteService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly telegramHealth: TelegramHealthService,
  ) {}

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }

  async buildOperatorLink(rawToken: string): Promise<string> {
    const botUsername = await this.telegramHealth.resolveBotUsername();
    if (!botUsername) {
      throw new BadRequestException(
        'Telegram bot ยังไม่ได้ตั้งค่า — กรุณาตั้ง TELEGRAM_BOT_TOKEN หรือ TELEGRAM_BOT_USERNAME',
      );
    }
    return `https://t.me/${botUsername}?start=op_${rawToken}`;
  }

  async isVerifiedOperator(userId: string): Promise<boolean> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, employeeId: null, isActive: true },
      select: { id: true },
    });
    if (!user) return false;

    const role = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId, isActive: true, deletedAt: null },
      select: { role: true },
    });
    if (!role || !STAFF_ROLE_SET.has(role.role)) return false;

    const usedInvite = await this.prisma.operatorTelegramInvite.findFirst({
      where: { userId, status: 'used' },
      orderBy: { usedAt: 'desc' },
    });
    if (!usedInvite) return false;

    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId, deletedAt: null, isActive: true },
    });
    return Boolean(account);
  }

  async getLinkStatus(userId: string): Promise<OperatorTelegramLinkResponse> {
    await this.assertBackofficeUser(userId);

    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId, deletedAt: null, isActive: true },
      orderBy: { linkedAt: 'desc' },
    });
    const usedInvite = await this.prisma.operatorTelegramInvite.findFirst({
      where: { userId, status: 'used' },
      orderBy: { usedAt: 'desc' },
    });
    if (account && usedInvite) {
      return {
        status: 'LINKED',
        deepLink: null,
        expiresAt: null,
        linkedAt: usedInvite.usedAt?.toISOString() ?? account.linkedAt.toISOString(),
        telegramUsername: account.username,
      };
    }

    const pending = await this.prisma.operatorTelegramInvite.findFirst({
      where: { userId, status: 'pending', expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (pending) {
      return {
        status: 'PENDING',
        deepLink: null,
        expiresAt: pending.expiresAt.toISOString(),
        linkedAt: null,
        telegramUsername: null,
      };
    }

    const expired = await this.prisma.operatorTelegramInvite.findFirst({
      where: { userId, status: { in: ['pending', 'expired'] } },
      orderBy: { createdAt: 'desc' },
    });
    if (expired) {
      return {
        status: 'EXPIRED',
        deepLink: null,
        expiresAt: expired.expiresAt.toISOString(),
        linkedAt: null,
        telegramUsername: null,
      };
    }

    return {
      status: 'NONE',
      deepLink: null,
      expiresAt: null,
      linkedAt: null,
      telegramUsername: null,
    };
  }

  async createLink(actor: ActorContext, userId: string): Promise<{
    inviteId: string;
    deepLink: string;
    expiresAt: string;
    status: OperatorTelegramInviteStatus;
  }> {
    await this.assertBackofficeUser(userId);

    await this.prisma.operatorTelegramInvite.updateMany({
      where: { userId, status: 'pending' },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
      },
    });

    const rawToken = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + DEFAULT_EXPIRY_DAYS * 24 * 60 * 60 * 1000);
    const invite = await this.prisma.operatorTelegramInvite.create({
      data: {
        userId,
        tokenHash: this.hashToken(rawToken),
        tokenPreview: rawToken.slice(0, 8),
        status: 'pending',
        expiresAt,
        createdBy: actor.userId,
      },
    });

    const deepLink = await this.buildOperatorLink(rawToken);
    await this.audit.record(actor, {
      entityType: 'OperatorTelegramInvite',
      entityId: invite.id,
      action: 'operator_telegram_link_created',
      after: { targetUserId: userId, expiresAt: expiresAt.toISOString() },
    });

    return {
      inviteId: invite.id,
      deepLink,
      expiresAt: expiresAt.toISOString(),
      status: invite.status,
    };
  }

  async revokeLink(actor: ActorContext, userId: string): Promise<{ ok: true }> {
    await this.assertBackofficeUser(userId);

    await this.prisma.operatorTelegramInvite.updateMany({
      where: { userId, status: 'pending' },
      data: {
        status: 'cancelled',
        cancelledAt: new Date(),
        cancelledBy: actor.userId,
      },
    });

    await this.prisma.telegramAccount.updateMany({
      where: { userId, deletedAt: null },
      data: {
        isActive: false,
        deletedAt: new Date(),
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'User',
      entityId: userId,
      action: 'operator_telegram_link_revoked',
    });

    return { ok: true };
  }

  async consumeInvite(params: {
    rawToken: string;
    profile: {
      telegramUserId: number;
      username?: string;
      firstName?: string;
      lastName?: string;
    };
    telegramAccountId: string;
    pendingUserId: string;
    chatId: number;
  }): Promise<{ userId: string }> {
    const tokenHash = this.hashToken(params.rawToken);
    const invite = await this.prisma.operatorTelegramInvite.findFirst({
      where: { tokenHash },
      include: { user: { select: { id: true, employeeId: true, isActive: true, username: true } } },
    });

    if (!invite) throw new BadRequestException('ลิงก์ไม่ถูกต้อง');
    if (invite.status === 'used') throw new BadRequestException('ลิงก์นี้ถูกใช้งานแล้ว');
    if (invite.status === 'cancelled') throw new BadRequestException('ลิงก์ถูกยกเลิกแล้ว');
    if (invite.status === 'expired' || invite.expiresAt < new Date()) {
      await this.prisma.operatorTelegramInvite.update({
        where: { id: invite.id },
        data: { status: 'expired' },
      });
      throw new BadRequestException('ลิงก์หมดอายุแล้ว กรุณาขอลิงก์ใหม่จากหน้าผู้ใช้หลังบ้าน');
    }

    const targetUser = invite.user;
    if (!targetUser.isActive || targetUser.employeeId) {
      throw new BadRequestException('บัญชีผู้ใช้หลังบ้านไม่พร้อมเชื่อมต่อ');
    }

    const role = await this.prisma.businessRoleAssignment.findFirst({
      where: { userId: targetUser.id, isActive: true, deletedAt: null },
      select: { role: true },
    });
    if (!role || !STAFF_ROLE_SET.has(role.role)) {
      throw new BadRequestException('บัญชีนี้ไม่ใช่ผู้ใช้หลังบ้านที่อนุญาต');
    }

    const tgUserId = BigInt(params.profile.telegramUserId);
    const existingAcc = await this.prisma.telegramAccount.findFirst({
      where: { telegramUserId: tgUserId, deletedAt: null },
      include: { user: { select: { id: true, employeeId: true, isActive: true, username: true } } },
    });

    if (existingAcc?.user.employeeId) {
      throw new BadRequestException('บัญชี Telegram นี้เชื่อมกับพนักงานแล้ว');
    }
    if (
      existingAcc
      && existingAcc.user.id !== targetUser.id
      && existingAcc.user.isActive
      && !existingAcc.user.username.startsWith('pending_tg_')
    ) {
      throw new BadRequestException('บัญชี Telegram นี้เชื่อมกับผู้ใช้อื่นแล้ว');
    }

    if (existingAcc) {
      await this.prisma.telegramAccount.update({
        where: { id: existingAcc.id },
        data: {
          userId: targetUser.id,
          chatId: BigInt(params.chatId),
          username: params.profile.username ?? null,
          isActive: true,
          deletedAt: null,
        },
      });
    } else {
      await this.prisma.telegramAccount.create({
        data: {
          userId: targetUser.id,
          telegramUserId: tgUserId,
          chatId: BigInt(params.chatId),
          username: params.profile.username ?? null,
          isActive: true,
        },
      });
    }

    await this.prisma.telegramAccount.updateMany({
      where: {
        userId: targetUser.id,
        telegramUserId: { not: tgUserId },
        deletedAt: null,
      },
      data: { isActive: false, deletedAt: new Date() },
    });

    await this.prisma.operatorTelegramInvite.update({
      where: { id: invite.id },
      data: {
        status: 'used',
        usedAt: new Date(),
        usedTelegramUserId: tgUserId,
      },
    });

    await this.prisma.operatorTelegramInvite.updateMany({
      where: { userId: targetUser.id, status: 'pending', id: { not: invite.id } },
      data: { status: 'cancelled', cancelledAt: new Date() },
    });

    return { userId: targetUser.id };
  }

  private async assertBackofficeUser(userId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null, employeeId: null },
      select: { id: true },
    });
    if (!user) throw new NotFoundException('ไม่พบผู้ใช้หลังบ้าน');
  }
}
