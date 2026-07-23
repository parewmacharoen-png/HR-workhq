// ============================================================================
// modules/telegram/application/telegram-verification.service.ts
// Employee identity verification onboarding (HR-11.5)
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramIdentityService } from '../../security/application/telegram-identity.service';
import { TelegramIdentityGuard } from '../../security/application/telegram-identity-guard.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { EmployeeTelegramInviteService } from '../../employee-onboarding/application/employee-telegram-invite.service';
import { TelegramState, SessionContext } from '../domain/entities/telegram-session.types';

export interface VerificationDraft extends Record<string, unknown> {
  employeeCode?: string;
  inviteCode?: string;
  useInvite?: boolean;
}

type SaveSessionFn = (accountId: string, state: TelegramState, context: SessionContext) => Promise<void>;
type ShowMainMenuFn = (chatId: number, userId: string) => Promise<void>;
type AssignRoleFn = (userId: string, companyId: string) => Promise<void>;

@Injectable()
export class TelegramVerificationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identities: TelegramIdentityService,
    private readonly guard: TelegramIdentityGuard,
    private readonly gateway: TelegramGatewayService,
    private readonly inviteService: EmployeeTelegramInviteService,
  ) {}

  getDraft(context: SessionContext): VerificationDraft {
    return (context.draft ?? {}) as VerificationDraft;
  }

  async start(accountId: string, chatId: number, saveSession: SaveSessionFn): Promise<void> {
    await this.gateway.sendMessage({
      chatId,
      text:
        'กรุณากดลิงก์เชิญจาก HR เพื่อเริ่มลงทะเบียน',
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: 'ใช้ Invite Code', callback_data: 'identity:use_invite' }],
          [{ text: 'ใช้รหัสพนักงาน', callback_data: 'identity:use_code' }],
          [{ text: 'ติดต่อ HR', callback_data: 'identity:contact_hr' }],
        ],
      },
    });
    await saveSession(accountId, 'identity_pending', { draft: {} });
  }

  async handleText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    state: TelegramState,
    context: SessionContext,
    saveSession: SaveSessionFn,
    profile: { telegramUserId: number; username?: string; firstName?: string; lastName?: string },
    hooks: { showMainMenu: ShowMainMenuFn; assignDefaultEmployeeRole: AssignRoleFn },
  ): Promise<void> {
    const draft = this.getDraft(context);

    if (state === 'identity_enter_code') {
      const code = text.trim().toUpperCase();
      if (!/^EMP\d{6}$/.test(code)) {
        await this.gateway.sendMessage({ chatId, text: 'รหัสพนักงานไม่ถูกต้อง กรุณากรอกใหม่ (เช่น EMP000001):' });
        return;
      }
      draft.employeeCode = code;
      await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเบอร์โทรศัพท์ที่ลงทะเบียนไว้กับ HR:' });
      await saveSession(account.id, 'identity_enter_phone', { draft });
      return;
    }

    if (state === 'identity_enter_invite') {
      draft.inviteCode = text.trim();
      await this.gateway.sendMessage({ chatId, text: 'กรุณากรอกเบอร์โทรศัพท์ที่ลงทะเบียนไว้กับ HR:' });
      await saveSession(account.id, 'identity_enter_phone', { draft });
      return;
    }

    if (state === 'identity_enter_phone') {
      const phone = text.replace(/\s/g, '');
      if (!/^\d{9,12}$/.test(phone)) {
        await this.gateway.sendMessage({ chatId, text: 'เบอร์โทรไม่ถูกต้อง กรุณากรอกอีกครั้ง:' });
        return;
      }

      let result: 'approved' | 'pending';
      if (draft.useInvite && draft.inviteCode) {
        result = await this.identities.verifyInviteCodeAndPhone({
          inviteCode: draft.inviteCode,
          phone,
          profile,
          telegramAccountId: account.id,
          pendingUserId: account.userId,
        });
      } else if (draft.employeeCode) {
        result = await this.identities.verifyEmployeeCodeAndPhone({
          employeeCode: draft.employeeCode,
          phone,
          profile,
          telegramAccountId: account.id,
          pendingUserId: account.userId,
        });
      } else {
        await this.gateway.sendMessage({ chatId, text: 'กรุณาเริ่มใหม่ด้วย /start' });
        return;
      }

      if (result === 'approved') {
        const linkedAccount = await this.prisma.telegramAccount.findFirst({
          where: { id: account.id, deletedAt: null },
          select: { userId: true },
        });
        const linkedUserId = linkedAccount?.userId ?? account.userId;
        const assignment = await this.findPrimaryCompany(linkedUserId);
        if (assignment) {
          await hooks.assignDefaultEmployeeRole(linkedUserId, assignment);
        }
        await this.gateway.sendMessage({
          chatId,
          text: '✅ ยืนยันตัวตนสำเร็จ! ยินดีต้อนรับสู่ WorkHQ',
        });
        await hooks.showMainMenu(chatId, linkedUserId);
        await saveSession(account.id, 'idle', {});
      } else {
        await this.gateway.sendMessage({
          chatId,
          text: '⏳ ไม่สามารถยืนยันอัตโนมัติได้\nคำขอของคุณถูกส่งให้ HR ตรวจสอบ\nพิมพ์ /status เพื่อดูสถานะ',
        });
        await saveSession(account.id, 'identity_pending', { draft });
      }
    }
  }

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    saveSession: SaveSessionFn,
  ): Promise<void> {
    if (data === 'identity:use_code') {
      await this.gateway.sendMessage({
        chatId,
        text: 'กรุณากรอกรหัสพนักงาน (เช่น EMP000001):',
      });
      await saveSession(account.id, 'identity_enter_code', { draft: {} });
      return;
    }
    if (data === 'identity:contact_hr') {
      await this.gateway.sendMessage({
        chatId,
        text: 'กรุณาติดต่อฝ่าย HR ของบริษัทเพื่อขอลิงก์เชิญ Telegram',
      });
      return;
    }
    if (data === 'identity:use_invite') {
      await this.gateway.sendMessage({ chatId, text: 'กรุณากรอก Invite Code (เช่น EMP-KW-1234):' });
      await saveSession(account.id, 'identity_enter_invite', { draft: { useInvite: true } });
    }
  }

  async showRegistrationStatus(chatId: number, telegramUserId: number): Promise<void> {
    const { message, status } = await this.inviteService.getTelegramUserOnboardingStatus(telegramUserId);
    const lines = [message];
    if (status === 'pending_review' || status === 'onboarding_submitted') {
      const identity = await this.prisma.telegramIdentity.findFirst({
        where: { telegramUserId: BigInt(telegramUserId), deletedAt: null },
        orderBy: { linkedAt: 'desc' },
      });
      if (identity) {
        const submission = await this.prisma.employeeSelfOnboardingSubmission.findFirst({
          where: { employeeId: identity.employeeId, status: 'submitted' },
          orderBy: { submittedAt: 'desc' },
        });
        if (submission?.submittedAt) {
          lines.push(
            '',
            `ส่งคำขอเมื่อ: ${submission.submittedAt.toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
          );
        }
      }
    }
    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: status === 'pending_review' ? 'HTML' : undefined,
    });
  }

  private async findPrimaryCompany(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user?.employeeId) return null;
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId: user.employeeId, deletedAt: null, isPrimaryCompany: true },
      select: { companyId: true },
    });
    return assignment?.companyId ?? null;
  }
}
