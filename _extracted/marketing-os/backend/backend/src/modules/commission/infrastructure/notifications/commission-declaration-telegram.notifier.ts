// ============================================================================
// Sends Telegram notifications for commission declaration workflow events.
// ============================================================================

import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { CommissionDeclarationSideEffects } from '../../application/commission-declaration-side-effects.port';

@Injectable()
export class CommissionDeclarationTelegramNotifier implements CommissionDeclarationSideEffects {
  private readonly logger = new Logger(CommissionDeclarationTelegramNotifier.name);

  constructor(private readonly prisma: PrismaService) {}

  async onRejected(employeeId: string, reason: string): Promise<void> {
    const token = process.env['TELEGRAM_BOT_TOKEN'];
    if (!token) return;

    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!user) return;

    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId: user.id, deletedAt: null, isActive: true },
      select: { chatId: true },
    });
    if (!account?.chatId) return;

    const chatId = Number(account.chatId);
    const text =
      '❌ <b>ประกาศค่าคอมถูกปฏิเสธ</b>\n'
      + `เหตุผล: ${reason}\n\n`
      + 'กรุณาแก้ไขและส่งใหม่ผ่านปุ่มด้านล่าง';
    const body = {
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [[{ text: '✏️ แก้ไขประกาศค่าคอม', callback_data: 'declaration:correct' }]],
      },
    };

    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const payload = await res.text();
        this.logger.warn(`Telegram reject notification failed: ${payload}`);
      }
    } catch (err) {
      this.logger.error(`Telegram reject notification error for employee ${employeeId}`, err);
    }
  }
}
