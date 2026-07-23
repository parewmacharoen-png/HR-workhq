// ============================================================================
// EMP-001b — Telegram /start invite_<token> handler
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { EmployeeTelegramInviteService } from './employee-telegram-invite.service';
import { EmployeeOnboardingApprovalService } from './employee-onboarding-approval.service';
import { TelegramSelfOnboardingHandler } from './telegram-self-onboarding.handler';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { TelegramState, SessionContext } from '../../telegram/domain/entities/telegram-session.types';
import { ActorContext } from '../../../shared/kernel/actor-context';

type SaveSessionFn = (accountId: string, state: TelegramState, context: SessionContext) => Promise<void>;
type ShowMainMenuFn = (chatId: number, userId: string) => Promise<void>;
type AssignRoleFn = (userId: string, companyId: string) => Promise<void>;

@Injectable()
export class TelegramInviteLinkHandler {
  private readonly logger = new Logger(TelegramInviteLinkHandler.name);

  constructor(
    private readonly invites: EmployeeTelegramInviteService,
    private readonly onboardingApproval: EmployeeOnboardingApprovalService,
    private readonly selfOnboarding: TelegramSelfOnboardingHandler,
    private readonly gateway: TelegramGatewayService,
  ) {}

  parseInviteToken(startText: string): string | null {
    const trimmed = startText.trim();
    if (!trimmed.startsWith('/start')) return null;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return null;
    const payload = parts[1];
    if (!payload.startsWith('invite_')) return null;
    return payload.slice('invite_'.length);
  }

  async handleInviteStart(
    account: { id: string; userId: string },
    chatId: number,
    rawToken: string,
    profile: { telegramUserId: number; username?: string; firstName?: string; lastName?: string },
    hooks: {
      saveSession: SaveSessionFn;
      showMainMenu: ShowMainMenuFn;
      assignDefaultEmployeeRole: AssignRoleFn;
    },
  ): Promise<boolean> {
    try {
      const { employeeId, companyId } = await this.invites.consumeInvite({
        rawToken,
        profile: {
          telegramUserId: profile.telegramUserId,
          username: profile.username,
          firstName: profile.firstName,
          lastName: profile.lastName,
        },
        telegramAccountId: account.id,
        pendingUserId: account.userId,
        chatId,
      });

      await hooks.assignDefaultEmployeeRole(account.userId, companyId);

      const needsSelfOnboarding = await this.invites.employeeNeedsSelfOnboarding(employeeId);
      const actor: ActorContext = {
        userId: account.userId,
        companyId,
        impersonatorUserId: null,
      };

      if (needsSelfOnboarding) {
        await this.gateway.sendMessage({
          chatId,
          text:
            '🎉 <b>ยืนยันตัวตนสำเร็จ</b>\n\n' +
            'ต่อไปกรุณากรอกข้อมูลส่วนตัวเพื่อให้ HR ตรวจสอบ\n' +
            'ข้อมูลนี้จะยังไม่ถูกใช้ทันทีจนกว่า HR จะอนุมัติ',
          parseMode: 'HTML',
        });
        const resumed = await this.selfOnboarding.restartFlow(account, chatId, hooks.saveSession);
        if (!resumed) {
          await this.selfOnboarding.start(account, chatId, employeeId, companyId, hooks.saveSession);
        }
      } else {
        await this.onboardingApproval.completeExistingEmployeeInviteLink(
          actor,
          employeeId,
          profile.telegramUserId,
        );
        await this.gateway.sendMessage({
          chatId,
          text: '✅ เชื่อมบัญชี Telegram สำเร็จแล้ว ตอนนี้คุณสามารถใช้งาน WorkHQ ผ่าน Telegram ได้แล้ว',
        });
        await hooks.showMainMenu(chatId, account.userId);
      }
      return true;
    } catch (err: unknown) {
      this.logger.warn(`Invite link failed: ${(err as Error).message}`);
      await this.gateway.sendMessage({
        chatId,
        text: (err as Error).message,
      });
      return false;
    }
  }
}
