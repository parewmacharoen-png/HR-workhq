// ============================================================================
// test/helpers/telegram-test.factory.ts
// TEST-001c — reusable Telegram integration helpers
// ============================================================================

import { INestApplication } from '@nestjs/common';
import { PrismaService } from '../../src/shared/prisma/prisma.service';
import { TelegramBotService } from '../../src/modules/telegram/application/telegram-bot.service';
import { buildCallbackPayload } from './telegram-fixtures';
import { createTelegramAccount } from './fixtures';

export class TelegramTestFactory {
  constructor(
    private readonly app: INestApplication,
    private readonly prisma: PrismaService,
  ) {}

  private bot(): TelegramBotService {
    return this.app.get(TelegramBotService);
  }

  async linkUser(userId: string, telegramUserId?: number): Promise<{ tgId: number; chatId: number }> {
    const tgId = telegramUserId ?? Math.floor(Math.random() * 900_000) + 100_000;
    await createTelegramAccount(this.prisma, userId, tgId, tgId);
    return { tgId, chatId: tgId };
  }

  async tapCallback(userId: string, chatId: number, data: string): Promise<void> {
    await this.bot().handleUpdate(buildCallbackPayload(userId, chatId, data));
  }

  async tapCallbackForUser(userId: string, data: string): Promise<void> {
    const { tgId, chatId } = await this.linkUser(userId);
    await this.tapCallback(tgId, chatId, data);
  }
}
