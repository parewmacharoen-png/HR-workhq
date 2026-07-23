// ============================================================================
// modules/announcement/application/announcement-reminder.notifier.ts
// ANN-001 — Telegram reminders for unopened / unacknowledged announcements
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';

@Injectable()
export class AnnouncementReminderNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async sendUnopenedReminder(deliveryId: string): Promise<void> {
    const delivery = await this.prisma.announcementDelivery.findUnique({
      where: { id: deliveryId },
      include: { announcement: true, employee: { select: { id: true } } },
    });
    if (!delivery?.announcement) return;

    const accounts = await this.prisma.telegramAccount.findMany({
      where: {
        isActive: true,
        deletedAt: null,
        user: { employeeId: delivery.employeeId, deletedAt: null, isActive: true },
      },
    });

    const text = [
      '📢 <b>แจ้งเตือนประกาศที่ยังไม่ได้รับทราบ</b>',
      '',
      'เรื่อง:',
      `<b>${escapeHtml(delivery.announcement.title)}</b>`,
      '',
      'กรุณาเปิดอ่านและกดรับทราบ',
    ].join('\n');

    const keyboard = {
      inline_keyboard: [[
        { text: '📖 เปิดอ่าน', callback_data: `announcement:open:${deliveryId}` },
        { text: '✅ รับทราบ', callback_data: `announcement:ack:${deliveryId}` },
      ]],
    };

    for (const acc of accounts) {
      if (!acc.chatId) continue;
      await this.gateway.sendMessage({
        chatId: Number(acc.chatId),
        text,
        parseMode: 'HTML',
        replyMarkup: keyboard,
      });
    }
  }

  async sendUnacknowledgedReminder(deliveryId: string): Promise<void> {
    await this.sendUnopenedReminder(deliveryId);
  }

  /** Owner dashboard escalation — Telegram ping when acknowledgements are overdue. */
  async notifyOwnerOverdueEscalation(
    companyId: string,
    announcementTitle: string,
    overdueCount: number,
  ): Promise<void> {
    const owners = await this.prisma.businessRoleAssignment.findMany({
      where: { role: 'owner', isActive: true, deletedAt: null },
      select: { userId: true },
    });
    if (!owners.length) return;

    const text = [
      '⚠️ <b>ประกาศค้างรับทราบ (Owner)</b>',
      '',
      `เรื่อง: <b>${escapeHtml(announcementTitle)}</b>`,
      `พนักงานที่ยังไม่รับทราบ: ${overdueCount} คน`,
      '',
      'ตรวจสอบได้ที่ Dashboard → ประกาศ',
    ].join('\n');

    for (const owner of owners) {
      const accounts = await this.prisma.telegramAccount.findMany({
        where: {
          userId: owner.userId,
          isActive: true,
          deletedAt: null,
        },
      });
      for (const acc of accounts) {
        if (!acc.chatId) continue;
        await this.gateway.sendMessage({
          chatId: Number(acc.chatId),
          text,
          parseMode: 'HTML',
        }).catch(() => undefined);
      }
    }
  }
}

function escapeHtml(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
