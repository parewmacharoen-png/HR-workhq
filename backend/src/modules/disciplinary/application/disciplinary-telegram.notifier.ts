// ============================================================================
// modules/disciplinary/application/disciplinary-telegram.notifier.ts
// POL-025 Part G — notify + รับทราบ button
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { DisciplinaryActionResponse } from './dto/disciplinary.dto';

const ACTION_LABELS: Record<string, string> = {
  verbal_warning: 'ตักเตือนด้วยวาจา',
  warning_1: 'Warning 1',
  warning_2: 'Warning 2',
  termination: 'เลิกจ้าง',
};

@Injectable()
export class DisciplinaryTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifyEmployee(action: DisciplinaryActionResponse): Promise<void> {
    const account = await this.prisma.telegramAccount.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        user: { employeeId: action.employeeId, deletedAt: null },
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!account?.chatId) return;

    const label = ACTION_LABELS[action.actionType] ?? action.actionType;
    const lines = [
      `⚠️ <b>แจ้งเตือนทางวินัย</b>`,
      `<b>${label}</b>`,
      `เหตุผล: ${escapeHtml(action.reason)}`,
    ];
    if (action.details) lines.push(`รายละเอียด: ${escapeHtml(action.details)}`);
    if (action.actionType === 'termination' && action.terminationReason) {
      lines.push(`เหตุผลการเลิกจ้าง: ${escapeHtml(action.terminationReason)}`);
    }
    lines.push('', 'กรุณากดปุ่มด้านล่างเพื่อรับทราบ');

    await this.gateway.sendMessage({
      chatId: Number(account.chatId),
      text: lines.join('\n'),
      parseMode: 'HTML',
      messageType: 'disciplinary_notice',
      telegramAccountId: account.id,
      replyMarkup: {
        inline_keyboard: [[
          { text: 'รับทราบ', callback_data: `disciplinary:ack:${action.id}` },
        ]],
      },
    });
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
