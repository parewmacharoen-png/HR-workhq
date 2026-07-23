// ============================================================================
// modules/telegram/application/payroll-export.notifier.ts
// PAY-006 — notify Owner/Secretary when bank transfer export is created.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import type { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';

const HR_ROLES: BusinessRoleCode[] = ['owner', 'secretary'];

export interface PayrollExportNotifyPayload {
  companyId: string;
  batchId: string;
  cycleId: string;
  includedCount: number;
  exceptionCount: number;
  totalNetPayAmount: number;
}

@Injectable()
export class PayrollExportTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async notifyExportCreated(payload: PayrollExportNotifyPayload): Promise<void> {
    const cycle = await this.prisma.payrollCycle.findUnique({
      where: { id: payload.cycleId },
      select: { periodStart: true, periodEnd: true },
    });
    if (!cycle) return;

    const period = `${formatDate(cycle.periodStart)} → ${formatDate(cycle.periodEnd)}`;
    const text = [
      '🏦 <b>สร้างไฟล์โอนเงินเดือนแล้ว</b>',
      `รอบ: ${escapeHtml(period)}`,
      `จำนวนพนักงานพร้อมโอน: <b>${payload.includedCount}</b>`,
      payload.exceptionCount > 0
        ? `ข้อยกเว้น: <b>${payload.exceptionCount}</b> (Owner ยืนยันแล้ว)`
        : 'ไม่มีข้อยกเว้น',
      `ยอดรวมสุทธิ: <b>฿${formatMoney(payload.totalNetPayAmount)}</b>`,
      '',
      'ดาวน์โหลดไฟล์ได้ในระบบ Payroll',
    ].join('\n');

    const userIds = await this.resolveUserIdsByRoles(payload.companyId, HR_ROLES);
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
        messageType: 'payroll_export_notice',
        telegramAccountId: account.id,
      }).catch(() => undefined);
    }
  }

  private userMatchesCompanyScope(
    grants: Array<{ scopeType: string; companyId: string | null }>,
    companyId: string,
  ): boolean {
    return grants.some(
      (grant) => grant.scopeType === 'all' || (grant.scopeType === 'company' && grant.companyId === companyId),
    );
  }
}

function formatMoney(value: number): string {
  return value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
