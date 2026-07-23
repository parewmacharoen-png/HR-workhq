// ============================================================================
// modules/telegram/application/telegram-message-log.service.ts
// Persists inbound/outbound Telegram traffic to telegram.telegram_messages_log.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class TelegramMessageLogService {
  private readonly logger = new Logger(TelegramMessageLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  async logMessage(
    accountId: string,
    direction: 'inbound' | 'outbound',
    messageType: string,
    payload: unknown,
    telegramMessageId?: number | null,
  ): Promise<void> {
    try {
      await this.prisma.telegramMessageLog.create({
        data: {
          id: randomUUID(),
          telegramAccountId: accountId,
          direction,
          messageType,
          payload: payload as Prisma.InputJsonValue,
          telegramMessageId: telegramMessageId != null ? BigInt(telegramMessageId) : null,
        },
      });
    } catch (err) {
      this.logger.warn(`Message log failed (${direction}/${messageType})`, err);
    }
  }

  async resolveAccountIdByChat(chatId: number): Promise<string | null> {
    try {
      const acc = await this.prisma.telegramAccount.findFirst({
        where: { chatId: BigInt(chatId), deletedAt: null, isActive: true },
        select: { id: true },
      });
      return acc?.id ?? null;
    } catch {
      return null;
    }
  }
}
