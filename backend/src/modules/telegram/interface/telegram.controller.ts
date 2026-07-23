// ============================================================================
// modules/telegram/interface/telegram.controller.ts
// Webhook endpoint. Telegram POSTs all updates here.
// The route is public (no JWT required from Telegram servers).
// Validates path secret and X-Telegram-Bot-Api-Secret-Token header.
// ============================================================================

import {
  Body, Controller, Headers, HttpCode, Param, Post, UnauthorizedException,
} from '@nestjs/common';
import { TelegramBotService } from '../application/telegram-bot.service';
import { Public } from '../../../auth/decorators/public.decorator';
import { AlertingService } from '../../../common/monitoring/alerting.service';

interface TelegramWebhookBody {
  update_id?: number;
}

@Controller('telegram')
export class TelegramController {
  constructor(
    private readonly bot: TelegramBotService,
    private readonly alerting: AlertingService,
  ) {}

  /** /api/v1/telegram/webhook/:secret */
  @Public()
  @HttpCode(200)
  @Post('webhook/:secret')
  async webhook(
    @Param('secret') secret: string,
    @Headers('x-telegram-bot-api-secret-token') headerSecret: string | undefined,
    @Body() body: unknown,
  ): Promise<{ ok: boolean }> {
    const expected = process.env['TELEGRAM_WEBHOOK_SECRET'];
    if (!expected) {
      throw new UnauthorizedException('Webhook secret not configured');
    }
    if (secret !== expected || headerSecret !== expected) {
      throw new UnauthorizedException('Invalid webhook secret');
    }

    const update = body as TelegramWebhookBody;
    // Fire and forget — Telegram requires < 5s response
    setImmediate(() => {
      this.bot.handleUpdate(body as Parameters<typeof this.bot.handleUpdate>[0]).catch((err) => {
        this.alerting.telegramProcessingFailure({
          updateId: update.update_id,
          error: err,
        });
      });
    });
    return { ok: true };
  }
}
