// ============================================================================
// modules/telegram/application/final-settlement.notifier.ts
// PAY-005 / PAY-005c — final payroll settlement Telegram notifications.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import type { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';

const HR_ROLES: BusinessRoleCode[] = ['owner', 'secretary'];

export interface FinalSettlementNotifyPayload {
  companyId: string;
  settlementId: string;
  employeeId: string;
  netPayableAmount: number;
}

export interface FinalSettlementPaidNotifyPayload extends FinalSettlementNotifyPayload {
  paidAt: string;
  summaryPath?: string;
}

@Injectable()
export class FinalSettlementTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifySubmitted(payload: FinalSettlementNotifyPayload): Promise<void> {
    const employee = await this.loadEmployee(payload.employeeId);
    if (!employee) return;

    const text = [
      '📋 <b>ส่งอนุมัติค่าจ้างสุดท้าย</b>',
      `พนักงาน: <b>${escapeHtml(fullName(employee))}</b>`,
      `ยอดสุทธิ: <b>฿${formatMoney(payload.netPayableAmount)}</b>`,
      '',
      'กรุณาตรวจสอบและอนุมัติในระบบ',
    ].join('\n');

    await this.notifyOwners(payload.companyId, text);
  }

  async notifyApproved(payload: FinalSettlementNotifyPayload): Promise<void> {
    const employee = await this.loadEmployee(payload.employeeId);
    if (!employee) return;

    const text = [
      '✅ <b>อนุมัติค่าจ้างสุดท้ายแล้ว</b>',
      `พนักงาน: <b>${escapeHtml(fullName(employee))}</b>`,
      `ยอดสุทธิ: <b>฿${formatMoney(payload.netPayableAmount)}</b>`,
      '',
      'HR/Secretary สามารถทำเครื่องหมายว่าจ่ายแล้วได้',
    ].join('\n');

    await this.notifyHrRoles(payload.companyId, text);
  }

  async notifyPaid(payload: FinalSettlementPaidNotifyPayload): Promise<void> {
    const employee = await this.loadEmployee(payload.employeeId);
    if (!employee) return;

    const paidDate = formatDate(payload.paidAt);
    const summaryUrl = buildSummaryUrl(payload.summaryPath);
    const text = [
      '💰 <b>จ่ายค่าจ้างสุดท้ายแล้ว</b>',
      '',
      `ยอดสุทธิ: <b>฿${formatMoney(payload.netPayableAmount)}</b>`,
      `วันที่จ่าย: ${paidDate}`,
      '',
      summaryUrl ? 'กดปุ่มด้านล่างเพื่อดูสรุปยอด' : 'หากมีข้อสงสัย กรุณาติดต่อ HR',
    ].join('\n');

    await this.notifyEmployee(payload.employeeId, text, summaryUrl);
  }

  private async notifyOwners(companyId: string, text: string): Promise<void> {
    const userIds = await this.resolveUserIdsByRoles(companyId, ['owner']);
    await this.sendToUsers(userIds, text);
  }

  private async notifyHrRoles(companyId: string, text: string): Promise<void> {
    const userIds = await this.resolveUserIdsByRoles(companyId, [...HR_ROLES]);
    await this.sendToUsers(userIds, text);
  }

  private async resolveUserIdsByRoles(
    companyId: string,
    roles: BusinessRoleCode[],
  ): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: {
        role: { in: roles },
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

  private async sendToUsers(userIds: string[], text: string): Promise<void> {
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
        messageType: 'final_settlement_notice',
        telegramAccountId: account.id,
      }).catch(() => undefined);
    }
  }

  private userMatchesCompanyScope(
    grants: Array<{ scopeType: string; companyId: string | null }>,
    companyId: string,
  ): boolean {
    return grants.some(
      (g) => g.scopeType === 'all' || (g.scopeType === 'company' && g.companyId === companyId),
    );
  }

  private async notifyEmployee(employeeId: string, text: string, summaryUrl?: string | null): Promise<void> {
    const account = await this.prisma.telegramAccount.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        user: { employeeId, deletedAt: null },
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!account?.chatId) return;

    const replyMarkup = summaryUrl
      ? { inline_keyboard: [[{ text: '📄 ดูสรุปค่าจ้างสุดท้าย', url: summaryUrl }]] }
      : undefined;

    await this.gateway.sendMessage({
      chatId: Number(account.chatId),
      text,
      parseMode: 'HTML',
      messageType: 'final_settlement_notice',
      telegramAccountId: account.id,
      replyMarkup,
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

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('th-TH', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function buildSummaryUrl(summaryPath?: string): string | null {
  if (!summaryPath) return null;
  const base = process.env.WORKHQ_WEB_URL
    ?? process.env.CORS_ORIGINS?.split(',')[0]?.trim()
    ?? '';
  if (!base) return null;
  const normalizedBase = base.replace(/\/$/, '');
  const path = summaryPath.startsWith('/') ? summaryPath : `/${summaryPath}`;
  return `${normalizedBase}${path}`;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
