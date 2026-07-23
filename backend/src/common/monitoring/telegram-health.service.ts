// ============================================================================
// common/monitoring/telegram-health.service.ts
// Telegram bot readiness probe (token + optional webhook registration).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { AppConfigService } from '../../config/app-config.service';

export interface TelegramHealthStatus {
  status: 'up' | 'down' | 'not_configured';
  webhookConfigured: boolean;
  botUsername?: string;
}

@Injectable()
export class TelegramHealthService {
  private cachedBotUsername: string | null | undefined;

  constructor(private readonly config: AppConfigService) {}

  /** Resolves @username for deep links — env override, then Telegram getMe cache. */
  async resolveBotUsername(): Promise<string | null> {
    const fromEnv = process.env.TELEGRAM_BOT_USERNAME?.trim();
    if (fromEnv) return fromEnv.replace(/^@/, '');

    if (this.cachedBotUsername !== undefined) {
      return this.cachedBotUsername;
    }

    const health = await this.check();
    this.cachedBotUsername = health.botUsername ?? null;
    return this.cachedBotUsername;
  }

  async check(): Promise<TelegramHealthStatus> {
    const token = this.config.telegramBotToken;
    const webhookUrl = this.config.telegramWebhookUrl;
    if (!token) {
      return { status: 'not_configured', webhookConfigured: false };
    }

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/getMe`, {
        signal: AbortSignal.timeout(5_000),
      });
      const data = await res.json() as { ok: boolean; result?: { username?: string } };
      if (!data.ok) {
        return { status: 'down', webhookConfigured: !!webhookUrl };
      }
      return {
        status: 'up',
        webhookConfigured: !!webhookUrl,
        botUsername: data.result?.username,
      };
    } catch {
      return { status: 'down', webhookConfigured: !!webhookUrl };
    }
  }
}
