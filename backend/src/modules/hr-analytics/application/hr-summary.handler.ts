// ============================================================================
// modules/hr-analytics/application/hr-summary.handler.ts
// ANALYTICS-001 — Owner Telegram HR summary
// ============================================================================

import { Injectable } from '@nestjs/common';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { HrAnalyticsService } from './hr-analytics.service';

@Injectable()
export class HrSummaryTelegramHandler {
  constructor(
    private readonly gateway: TelegramGatewayService,
    private readonly analytics: HrAnalyticsService,
  ) {}

  async sendSummary(chatId: number, companyId: string): Promise<void> {
    const text = await this.analytics.getTelegramSummary(companyId);
    await this.gateway.sendMessage({
      chatId,
      text,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[{ text: '🏠 เมนูหลัก', callback_data: 'home' }]],
      },
    });
  }
}
