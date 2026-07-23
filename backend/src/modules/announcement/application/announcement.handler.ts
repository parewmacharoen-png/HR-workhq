import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { AnnouncementService } from './announcement.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class AnnouncementTelegramHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly announcements: AnnouncementService,
  ) {}

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
  ): Promise<boolean> {
    if (data === 'announcement:list') {
      await this.showAnnouncements(account, chatId);
      return true;
    }
    if (data.startsWith('announcement:open:')) {
      const deliveryId = data.replace('announcement:open:', '');
      await this.openAnnouncement(account, chatId, deliveryId);
      return true;
    }
    if (data.startsWith('announcement:ack:')) {
      const deliveryId = data.replace('announcement:ack:', '');
      await this.acknowledgeAnnouncement(account, chatId, deliveryId);
      return true;
    }
    return false;
  }

  private actor(userId: string): ActorContext {
    return { userId, companyId: null, impersonatorUserId: null };
  }

  private async showAnnouncements(
    account: { userId: string },
    chatId: number,
  ): Promise<void> {
    const items = await this.announcements.listForEmployee(this.actor(account.userId));
    const unread = items.filter((a) => !a.delivery.acknowledgedAt);

    if (!unread.length) {
      await this.gateway.sendMessage({
        chatId,
        text: '📢 <b>ประกาศใหม่</b>\n\nไม่มีประกาศที่ยังไม่ได้อ่าน',
        parseMode: 'HTML',
      });
      return;
    }

    const latest = unread[0];
    await this.gateway.sendMessage({
      chatId,
      text: [
        '📢 <b>ประกาศใหม่</b>',
        '',
        `<b>${esc(latest.title)}</b>`,
        latest.body ? esc(latest.body).slice(0, 500) : '',
        unread.length > 1 ? `\n(+ อีก ${unread.length - 1} ประกาศ)` : '',
      ].filter(Boolean).join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [
            { text: 'เปิดอ่าน', callback_data: `announcement:open:${latest.delivery.id}` },
            { text: 'รับทราบ', callback_data: `announcement:ack:${latest.delivery.id}` },
          ],
        ],
      },
    });
  }

  private async openAnnouncement(
    account: { userId: string },
    chatId: number,
    deliveryId: string,
  ): Promise<void> {
    const delivery = await this.prisma.announcementDelivery.findUnique({
      where: { id: deliveryId },
      include: { announcement: true },
    });
    if (!delivery) {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่พบประกาศ' });
      return;
    }
    await this.announcements.markOpened(this.actor(account.userId), deliveryId);
    await this.gateway.sendMessage({
      chatId,
      text: [
        `<b>${esc(delivery.announcement.title)}</b>`,
        '',
        delivery.announcement.body ? esc(delivery.announcement.body) : '(ไม่มีเนื้อหา)',
      ].join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[
          { text: 'รับทราบ', callback_data: `announcement:ack:${deliveryId}` },
        ]],
      },
    });
  }

  private async acknowledgeAnnouncement(
    account: { userId: string },
    chatId: number,
    deliveryId: string,
  ): Promise<void> {
    try {
      await this.announcements.markAcknowledged(this.actor(account.userId), deliveryId);
      await this.gateway.sendMessage({ chatId, text: '✅ รับทราบประกาศแล้ว' });
    } catch {
      await this.gateway.sendMessage({ chatId, text: '❌ ไม่สามารถรับทราบได้' });
    }
  }
}

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
