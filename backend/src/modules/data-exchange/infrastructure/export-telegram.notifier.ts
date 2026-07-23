// ============================================================================
// Export Telegram notifier
// ============================================================================

import { Injectable, Optional } from '@nestjs/common';
import { ExportJob } from '@prisma/client';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { PrismaService } from '../../../shared/prisma/prisma.service';

@Injectable()
export class ExportTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    @Optional() private readonly gateway?: TelegramGatewayService,
  ) {}

  async notifyExportComplete(actor: ActorContext, job: ExportJob): Promise<void> {
    if (!this.gateway) return;

    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId: actor.userId, deletedAt: null, isActive: true },
    });
    if (!account) return;

    const lines = [
      '✅ <b>Export สำเร็จ</b>',
      '',
      `รายงาน: ${job.module}`,
      `จำนวนแถว: ${job.rowCount}`,
      `รูปแบบ: ${job.format}`,
      `เวลา: ${job.completedAt?.toISOString() ?? ''}`,
    ];

    const buttons: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
    if (job.googleSheetUrl) {
      buttons.push([{ text: '📊 เปิด Google Sheets', url: job.googleSheetUrl }]);
    }
    const apiBase = process.env.WORKHQ_PUBLIC_API_BASE ?? process.env.API_PUBLIC_BASE ?? '';
    if (job.storageKey && apiBase) {
      const downloadUrl = `${apiBase.replace(/\/$/, '')}/exports/${job.id}/download`;
      if (job.format === 'csv' || job.format === 'xlsx' || job.format === 'pdf') {
        buttons.push([{ text: '📁 ดาวน์โหลดไฟล์', url: downloadUrl }]);
      }
    }

    if (!account.chatId) return;

    await this.gateway.sendMessage({
      chatId: Number(account.chatId),
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: buttons.length ? { inline_keyboard: buttons } : undefined,
    });
  }

  async notifyExportFailed(actor: ActorContext, jobId: string, reason: string): Promise<void> {
    if (!this.gateway) return;
    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId: actor.userId, deletedAt: null, isActive: true },
    });
    if (!account?.chatId) return;

    await this.gateway.sendMessage({
      chatId: Number(account.chatId),
      text: [
        '❌ <b>Export ไม่สำเร็จ</b>',
        '',
        `Job: ${jobId.slice(0, 8)}`,
        `เหตุผล: ${reason}`,
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[{ text: 'ลองใหม่', callback_data: `export:retry:${jobId}` }]],
      },
    });
  }
}
