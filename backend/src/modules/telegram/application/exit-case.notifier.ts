// ============================================================================
// modules/telegram/application/exit-case.notifier.ts
// EMP-012 / EMP-012b — exit case Telegram notifications.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import type { ExitCaseType } from '../../exit/domain/services/exit-lifecycle.mapper';

const LEADER_ROLES = ['owner', 'secretary', 'big_leader'] as const;

const TYPE_LABELS: Record<ExitCaseType, string> = {
  resignation: 'ลาออก',
  termination: 'เลิกจ้าง',
  absconding: 'หลบหนี',
};

export interface ExitCaseNotifyPayload {
  companyId: string;
  exitCaseId: string;
  employeeId: string;
  exitType: ExitCaseType;
  effectiveTerminationDate: string;
  pendingItems?: string[];
  cancellationReason?: string;
}

@Injectable()
export class ExitCaseTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifyNewExitCase(payload: ExitCaseNotifyPayload): Promise<void> {
    const employee = await this.loadEmployee(payload.employeeId);
    if (!employee) return;

    const typeLabel = TYPE_LABELS[payload.exitType] ?? payload.exitType;
    const leaderText = [
      '🚪 <b>เคสลาออกใหม่</b>',
      `พนักงาน: <b>${escapeHtml(fullName(employee))}</b>`,
      `ประเภท: ${typeLabel}`,
      `วันที่มีผล: ${payload.effectiveTerminationDate}`,
    ].join('\n');

    await this.notifyLeaders(payload.companyId, leaderText);
    await this.notifyEmployee(payload.employeeId, [
      '📋 <b>แจ้งเริ่มขั้นตอนลาออก</b>',
      '',
      `ประเภท: ${typeLabel}`,
      `วันที่มีผล: ${payload.effectiveTerminationDate}`,
      '',
      'HR จะติดต่อเรื่องการส่งมอบทรัพย์สินและเช็กลิสต์ลาออก',
    ].join('\n'));
  }

  async notifyChecklistPending(payload: ExitCaseNotifyPayload): Promise<void> {
    if (!payload.pendingItems?.length) return;

    const employee = await this.loadEmployee(payload.employeeId);
    if (!employee) return;

    const items = payload.pendingItems.map((i) => `• ${escapeHtml(i)}`).join('\n');
    const text = [
      '⏳ <b>เช็กลิสต์ลาออกค้างอยู่</b>',
      `พนักงาน: <b>${escapeHtml(fullName(employee))}</b>`,
      '',
      items,
    ].join('\n');

    await this.notifyLeaders(payload.companyId, text);
  }

  async notifyExitCompleted(payload: ExitCaseNotifyPayload): Promise<void> {
    const employee = await this.loadEmployee(payload.employeeId);
    if (!employee) return;

    const typeLabel = TYPE_LABELS[payload.exitType] ?? payload.exitType;
    const leaderText = [
      '✅ <b>ปิดเคสลาออกแล้ว</b>',
      `พนักงาน: <b>${escapeHtml(fullName(employee))}</b>`,
      `ประเภท: ${typeLabel}`,
    ].join('\n');

    await this.notifyLeaders(payload.companyId, leaderText);
    await this.notifyEmployee(payload.employeeId, [
      '✅ <b>ขั้นตอนลาออกเสร็จสมบูรณ์</b>',
      '',
      'ขอบคุณที่ร่วมงานกับเรา',
    ].join('\n'));
  }

  async notifyExitCancelled(payload: ExitCaseNotifyPayload): Promise<void> {
    const employee = await this.loadEmployee(payload.employeeId);
    if (!employee) return;

    const typeLabel = TYPE_LABELS[payload.exitType] ?? payload.exitType;
    const reason = payload.cancellationReason
      ? `\nเหตุผล: ${escapeHtml(payload.cancellationReason)}`
      : '';
    const leaderText = [
      '🚫 <b>ยกเลิกเคสลาออก</b>',
      `พนักงาน: <b>${escapeHtml(fullName(employee))}</b>`,
      `ประเภท: ${typeLabel}`,
      reason,
    ].filter(Boolean).join('\n');

    await this.notifyLeaders(payload.companyId, leaderText);
    await this.notifyEmployee(payload.employeeId, [
      '🚫 <b>เคสลาออกถูกยกเลิก</b>',
      '',
      payload.cancellationReason
        ? `เหตุผล: ${escapeHtml(payload.cancellationReason)}`
        : 'HR จะติดต่อหากมีข้อสงสัย',
    ].join('\n'));
  }

  private async notifyLeaders(companyId: string, text: string): Promise<void> {
    const userIds = await this.resolveLeaderUserIds(companyId);
    if (!userIds.length) return;

    const accounts = await this.prisma.telegramAccount.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        userId: { in: userIds },
      },
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
        messageType: 'exit_case_notice',
        telegramAccountId: account.id,
      }).catch(() => undefined);
    }
  }

  private async resolveLeaderUserIds(companyId: string): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: {
        role: { in: [...LEADER_ROLES] },
        isActive: true,
        deletedAt: null,
      },
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

  private async notifyEmployee(employeeId: string, text: string): Promise<void> {
    const account = await this.prisma.telegramAccount.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        user: { employeeId, deletedAt: null },
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!account?.chatId) return;

    await this.gateway.sendMessage({
      chatId: Number(account.chatId),
      text,
      parseMode: 'HTML',
      messageType: 'exit_case_notice',
      telegramAccountId: account.id,
    }).catch(() => undefined);
  }

  private async loadEmployee(employeeId: string) {
    return this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { firstName: true, lastName: true },
    });
  }
}

function fullName(employee: { firstName: string; lastName: string }): string {
  return `${employee.firstName} ${employee.lastName}`.trim();
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
