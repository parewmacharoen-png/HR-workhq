// ============================================================================
// Telegram /start op_<token> — back-office operator linking
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { OperatorTelegramInviteService } from '../../permission/application/operator-telegram-invite.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';

type ShowMainMenuFn = (chatId: number, userId: string) => Promise<void>;

@Injectable()
export class TelegramOperatorLinkHandler {
  private readonly logger = new Logger(TelegramOperatorLinkHandler.name);

  constructor(
    private readonly operatorInvites: OperatorTelegramInviteService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  parseOperatorToken(startText: string): string | null {
    const trimmed = startText.trim();
    if (!trimmed.startsWith('/start')) return null;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 2) return null;
    const payload = parts[1];
    if (!payload.startsWith('op_')) return null;
    return payload.slice('op_'.length);
  }

  async handleOperatorStart(
    account: { id: string; userId: string },
    chatId: number,
    rawToken: string,
    profile: { telegramUserId: number; username?: string; firstName?: string; lastName?: string },
    hooks: { showMainMenu: ShowMainMenuFn },
  ): Promise<boolean> {
    try {
      const { userId } = await this.operatorInvites.consumeInvite({
        rawToken,
        profile,
        telegramAccountId: account.id,
        pendingUserId: account.userId,
        chatId,
      });

      await this.gateway.sendMessage({
        chatId,
        text: [
          '✅ <b>เชื่อม Telegram สำเร็จ</b>',
          '',
          'คุณสามารถใช้งานเมนูผู้บริหารได้แล้ว:',
          '• งานรออนุมัติ',
          '• รายงาน / สรุปวันนี้',
          '• ปฏิทินบริษัท / วันลา',
          '• คุยกับ AI',
        ].join('\n'),
        parseMode: 'HTML',
      });

      await hooks.showMainMenu(chatId, userId);
      return true;
    } catch (err: unknown) {
      this.logger.warn(`Operator link failed: ${(err as Error).message}`);
      await this.gateway.sendMessage({
        chatId,
        text: (err as Error).message,
      });
      return true;
    }
  }
}
