// ============================================================================
// modules/training/application/training.handler.ts
// TRAIN-001 — Telegram 📚 การเรียนรู้
// ============================================================================

import { Injectable } from '@nestjs/common';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { TrainingService } from './training.service';

@Injectable()
export class TrainingTelegramHandler {
  constructor(
    private readonly gateway: TelegramGatewayService,
    private readonly training: TrainingService,
  ) {}

  async showLearningMenu(
    chatId: number,
    employeeId: string,
    userId: string,
  ): Promise<void> {
    const actor = { userId, impersonatorUserId: null, companyId: null };
    const assignments = await this.training.listMyAssignments(actor, employeeId);

    const required = assignments.filter((a) => a.status !== 'completed');
    const completed = assignments.filter((a) => a.status === 'completed');

    const lines = [
      '📚 <b>การเรียนรู้</b>',
      '',
      `<b>คอร์สที่ต้องเรียน</b> (${required.length})`,
      ...required.slice(0, 5).map((a) => `• ${a.course.title} — ${a.status}`),
      '',
      `<b>คอร์สที่เรียนแล้ว</b> (${completed.length})`,
      ...completed.slice(0, 3).map((a) => `• ${a.course.title}`),
    ];

    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [
          [{ text: '📋 คอร์สที่ต้องเรียน', callback_data: 'training:required' }],
          [{ text: '✅ เรียนแล้ว', callback_data: 'training:completed' }],
          [{ text: '🏠 เมนูหลัก', callback_data: 'home' }],
        ],
      },
    });
  }

  async handleCallback(
    account: { userId: string },
    chatId: number,
    data: string,
    employeeId: string,
  ): Promise<boolean> {
    if (data === 'training:required') {
      await this.showAssignmentList(account.userId, chatId, employeeId, 'required');
      return true;
    }
    if (data === 'training:completed') {
      await this.showAssignmentList(account.userId, chatId, employeeId, 'completed');
      return true;
    }
    return false;
  }

  private async showAssignmentList(
    userId: string,
    chatId: number,
    employeeId: string,
    mode: 'required' | 'completed',
  ): Promise<void> {
    const actor = { userId, impersonatorUserId: null, companyId: null };
    const assignments = await this.training.listMyAssignments(actor, employeeId);
    const filtered = mode === 'completed'
      ? assignments.filter((a) => a.status === 'completed')
      : assignments.filter((a) => a.status !== 'completed');

    const title = mode === 'completed' ? '✅ คอร์สที่เรียนแล้ว' : '📋 คอร์สที่ต้องเรียน';
    const lines = [title, ''];
    if (!filtered.length) {
      lines.push('ไม่มีรายการ');
    } else {
      for (const a of filtered.slice(0, 15)) {
        lines.push(`• ${a.course.title}${mode === 'required' ? ` — ${a.status}` : ''}`);
      }
    }

    await this.gateway.sendMessage({
      chatId,
      text: lines.join('\n'),
      replyMarkup: {
        inline_keyboard: [
          [{ text: '🔙 การเรียนรู้', callback_data: 'training:menu' }],
          [{ text: '🏠 เมนูหลัก', callback_data: 'home' }],
        ],
      },
    });
  }
}
