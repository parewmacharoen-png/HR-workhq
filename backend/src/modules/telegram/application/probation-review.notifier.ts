// ============================================================================
// modules/telegram/application/probation-review.notifier.ts
// EMP-010 — probation review reminder & outcome Telegram messages.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import type { ProbationReviewResponse } from '../../performance/application/dto/performance.dto';

const LEADER_ROLES = ['owner', 'secretary', 'big_leader'] as const;

export interface ProbationReminderEvent {
  companyId: string;
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  probationEndDate: string;
  daysRemaining: number;
  reviewId: string | null;
}

@Injectable()
export class ProbationReviewTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifyReminder(companyId: string, event: ProbationReminderEvent): Promise<void> {
    const leaderText = [
      '⏰ <b>ใกล้ครบทดลองงาน</b>',
      '',
      `<b>${escapeHtml(event.employeeName)}</b>`,
      '',
      'สิ้นสุดทดลองงาน:',
      escapeHtml(event.probationEndDate),
      '',
      `เหลือ <b>${event.daysRemaining}</b> วัน`,
      '',
      'กรุณาดำเนินการประเมินทดลองงาน (PASS / EXTEND / FAIL)',
    ].join('\n');
    await this.notifyLeaders(companyId, leaderText, event.reviewId);

    await this.notifyEmployee(event.employeeId, [
      '⏰ <b>ใกล้ครบทดลองงานแล้ว</b>',
      '',
      `สิ้นสุดทดลองงาน: ${escapeHtml(event.probationEndDate)}`,
      '',
      'HR จะติดต่อเพื่อประเมินผลทดลองงาน',
    ].join('\n'));
  }

  async notifyOutcomeResolved(
    review: ProbationReviewResponse,
    outcome: 'passed' | 'extended' | 'failed',
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: review.employeeId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
    const name = employee ? `${employee.firstName} ${employee.lastName}` : review.employeeId;

    const outcomeLabel = outcome === 'passed'
      ? 'ผ่านทดลองงาน (PASS)'
      : outcome === 'extended'
        ? 'ขยายทดลองงาน (EXTEND)'
        : 'ไม่ผ่านทดลองงาน (FAIL)';

    await this.notifyEmployee(review.employeeId, [
      '📋 <b>ผลการประเมินทดลองงาน</b>',
      '',
      outcomeLabel,
      review.extendedUntil ? `ขยายถึง: ${review.extendedUntil}` : '',
      review.notes ? escapeHtml(review.notes) : '',
    ].filter(Boolean).join('\n'));

    const leaderText = [
      '📋 <b>บันทึกผลทดลองงานแล้ว</b>',
      '',
      `<b>${escapeHtml(name)}</b>`,
      '',
      `ผล: ${outcomeLabel}`,
      review.extendedUntil ? `ขยายถึง: ${review.extendedUntil}` : '',
    ].filter(Boolean).join('\n');
    await this.notifyLeaders(review.companyId, leaderText, null);
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
      messageType: 'probation_review',
      telegramAccountId: account.id,
    });
  }

  private buildProbationActionKeyboard(reviewId: string): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
    return {
      inline_keyboard: [
        [
          { text: '✅ PASS', callback_data: `probation:pass:${reviewId}` },
          { text: '📅 EXTEND 30d', callback_data: `probation:extend:${reviewId}` },
          { text: '❌ FAIL', callback_data: `probation:fail:${reviewId}` },
        ],
      ],
    };
  }

  private async notifyLeaders(companyId: string, text: string, reviewId: string | null): Promise<void> {
    const userIds = await this.resolveLeaderUserIds(companyId);
    if (!userIds.length) return;

    const accounts = await this.prisma.telegramAccount.findMany({
      where: { deletedAt: null, isActive: true, userId: { in: userIds } },
    });

    const sent = new Set<number>();
    for (const account of accounts) {
      if (!account.chatId) continue;
      const chatId = Number(account.chatId);
      if (sent.has(chatId)) continue;
      sent.add(chatId);
      await this.gateway.sendMessage({
        chatId,
        text,
        parseMode: 'HTML',
        messageType: 'probation_review_leader',
        telegramAccountId: account.id,
        replyMarkup: reviewId ? this.buildProbationActionKeyboard(reviewId) : undefined,
      });
    }
  }

  private async resolveLeaderUserIds(companyId: string): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: { in: [...LEADER_ROLES] }, isActive: true, deletedAt: null },
      select: { userId: true, role: true },
    });

    const ids = new Set<string>();
    for (const assignment of assignments) {
      const user = await this.prisma.user.findFirst({
        where: { id: assignment.userId, deletedAt: null, isActive: true },
        include: { scopeGrants: { where: { deletedAt: null } } },
      });
      if (!user) continue;
      if (assignment.role === 'owner' || this.userMatchesCompanyScope(user.scopeGrants, companyId)) {
        ids.add(user.id);
      }
    }
    return [...ids];
  }

  private userMatchesCompanyScope(
    grants: Array<{ scopeType: string; companyId: string | null }>,
    companyId: string,
  ): boolean {
    return grants.some(
      (g) => g.scopeType === 'all' || (g.scopeType === 'company' && g.companyId === companyId),
    );
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
