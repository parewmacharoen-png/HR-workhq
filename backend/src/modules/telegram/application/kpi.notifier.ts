// ============================================================================
// modules/telegram/application/kpi.notifier.ts
// KPI-001
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import type { KpiAssignmentResponse } from '../../kpi/application/dto/kpi.dto';

@Injectable()
export class KpiTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifyAssigned(assignment: KpiAssignmentResponse): Promise<void> {
    await this.notifyEmployee(assignment.employeeId, [
      '📊 <b>KPI ใหม่ถูกมอบหมาย</b>',
      `รอบ: <b>${escapeHtml(assignment.cycleName)}</b>`,
      `แบบฟอร์ม: ${escapeHtml(assignment.templateName)}`,
    ].join('\n'));
  }

  async notifyScoreNeeded(assignment: KpiAssignmentResponse): Promise<void> {
    if (!assignment.reviewerId) return;

    await this.notifyEmployee(assignment.reviewerId, [
      '📝 <b>รอให้คะแนน KPI</b>',
      `พนักงาน: <b>${escapeHtml(assignment.employeeName)}</b> (${assignment.employeeCode})`,
      `รอบ: ${escapeHtml(assignment.cycleName)}`,
    ].join('\n'));
  }

  async notifyFinalized(assignment: KpiAssignmentResponse): Promise<void> {
    const gradeLine = assignment.score?.grade
      ? `เกรด: <b>${escapeHtml(assignment.score.grade)}</b> (${assignment.score.totalScore ?? '—'})`
      : '';

    await this.notifyEmployee(assignment.employeeId, [
      '✅ <b>KPI ถูกปิดรอบแล้ว</b>',
      `รอบ: ${escapeHtml(assignment.cycleName)}`,
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
      messageType: 'kpi_notice',
      telegramAccountId: account.id,
    }).catch(() => undefined);
  }
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
