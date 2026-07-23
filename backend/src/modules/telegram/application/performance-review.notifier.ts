// ============================================================================
// modules/telegram/application/performance-review.notifier.ts
// KPI-003
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import type { PerformanceReviewResponse } from '../../performance-review/application/dto/performance-review.dto';

@Injectable()
export class PerformanceReviewTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifyReviewCreated(review: PerformanceReviewResponse): Promise<void> {
    await this.notifyEmployee(review.employeeId, [
      '📋 <b>เปิดรอบประเมินผลงาน</b>',
      `รอบ: <b>${escapeHtml(review.cycleName)}</b>`,
    ].join('\n'));
  }

  async notifyReviewFinalized(review: PerformanceReviewResponse): Promise<void> {
    const gradeLine = review.grade
      ? `เกรด: <b>${escapeHtml(review.grade)}</b> (${review.finalScore ?? '—'})`
      : '';

    await this.notifyEmployee(review.employeeId, [
      '✅ <b>ปิดรอบประเมินผลงานแล้ว</b>',
      `รอบ: ${escapeHtml(review.cycleName)}`,
      gradeLine,
    ].filter(Boolean).join('\n'));
  }

  private async notifyEmployee(employeeId: string, text: string): Promise<void> {
    const account = await this.prisma.telegramAccount.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        user: { employeeId, deletedAt: null, isActive: true },
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!account?.chatId) return;
    await this.gateway.sendMessage({
      chatId: Number(account.chatId),
      text,
      parseMode: 'HTML',
      messageType: 'performance_review_notice',
      telegramAccountId: account.id,
    }).catch(() => undefined);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
