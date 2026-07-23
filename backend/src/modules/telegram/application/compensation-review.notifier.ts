// ============================================================================
// modules/telegram/application/compensation-review.notifier.ts
// SAL-001
// ============================================================================

import { Injectable, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { TelegramApprovalNotifier } from './telegram-approval.notifier';
import type {
  PromotionReviewResponse,
  SalaryReviewResponse,
} from '../../salary-review/application/dto/salary-review.dto';
import type { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';

const HR_ROLES: BusinessRoleCode[] = ['owner', 'secretary'];

@Injectable()
export class CompensationReviewTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    @Inject(forwardRef(() => TelegramApprovalNotifier))
    private readonly approvalNotifier: TelegramApprovalNotifier,
  ) {}

  async notifySalarySubmitted(review: SalaryReviewResponse): Promise<void> {
    const ownerIds = await this.resolveUserIdsByRoles(review.companyId, ['owner']);
    const company = await this.prisma.company.findFirst({
      where: { id: review.companyId, deletedAt: null },
      select: { name: true },
    });
    await this.approvalNotifier.notifyCustomApproval({
      reviewType: 'salary_review',
      reviewId: review.id,
      approverUserIds: ownerIds,
      display: {
        requestTypeLabel: 'อนุมัติปรับเงินเดือน',
        requesterName: review.employeeName,
        companyName: company?.name ?? '—',
        teamName: null,
        createdAt: review.createdAt,
        keyDetails: `จาก ฿${formatMoney(review.currentSalary)} → ฿${formatMoney(review.proposedSalary)}\nมีผล: ${review.effectiveDate}`,
      },
    });
  }

  async notifySalaryApproved(review: SalaryReviewResponse): Promise<void> {
    await this.notifyHr(review.companyId, [
      '✅ <b>อนุมัติปรับเงินเดือนแล้ว</b>',
      `พนักงาน: <b>${escapeHtml(review.employeeName)}</b>`,
      `เงินเดือนใหม่: ฿${formatMoney(review.proposedSalary)}`,
      `มีผล: ${review.effectiveDate}`,
    ].join('\n'));
    await this.notifyEmployee(review.employeeId, [
      '✅ <b>อนุมัติปรับเงินเดือนแล้ว</b>',
      `เงินเดือนใหม่: ฿${formatMoney(review.proposedSalary)}`,
      `มีผล: ${review.effectiveDate}`,
    ].join('\n'));
  }

  async notifySalaryRejected(review: SalaryReviewResponse): Promise<void> {
    await this.notifyHr(review.companyId, [
      '❌ <b>ปฏิเสธการปรับเงินเดือน</b>',
      `พนักงาน: <b>${escapeHtml(review.employeeName)}</b>`,
      review.reason ? escapeHtml(review.reason) : '',
    ].filter(Boolean).join('\n'));
  }

  async notifySalaryApplied(review: SalaryReviewResponse): Promise<void> {
    await this.notifyEmployee(review.employeeId, [
      '💰 <b>ปรับเงินเดือนมีผลแล้ว</b>',
      `เงินเดือนใหม่: ฿${formatMoney(review.proposedSalary)}`,
    ].join('\n'));
  }

  async notifyPromotionSubmitted(
    review: PromotionReviewResponse,
    pathValidation?: {
      valid: boolean;
      warning: string | null;
      suggestedPathCount?: number;
      suggestedPaths?: Array<{ name: string }>;
    } | null,
  ): Promise<void> {
    const ownerIds = await this.resolveUserIdsByRoles(review.companyId, ['owner']);
    const company = await this.prisma.company.findFirst({
      where: { id: review.companyId, deletedAt: null },
      select: { name: true },
    });
    const validationLine = pathValidation
      ? `\nผลตรวจเส้นทาง: ${pathValidation.valid ? '✅ อยู่ในเส้นทาง' : '⚠️ นอกเส้นทางที่กำหนด'}${pathValidation.warning ? `\n${pathValidation.warning}` : ''}${pathValidation.suggestedPaths?.length ? `\nเส้นทางแนะนำ: ${pathValidation.suggestedPaths.map((p) => p.name).join(', ')}` : ''}`
      : '';
    await this.approvalNotifier.notifyCustomApproval({
      reviewType: 'promotion_review',
      reviewId: review.id,
      approverUserIds: ownerIds,
      display: {
        requestTypeLabel: 'อนุมัติเลื่อนตำแหน่ง',
        requesterName: review.employeeName,
        companyName: company?.name ?? '—',
        teamName: null,
        createdAt: review.createdAt,
        keyDetails: `${review.currentPosition ?? '—'} → ${review.proposedPosition}\nมีผล: ${review.effectiveDate}${validationLine}`,
      },
    });
  }

  async notifyPromotionApproved(review: PromotionReviewResponse): Promise<void> {
    await this.notifyHr(review.companyId, [
      '✅ <b>อนุมัติเลื่อนตำแหน่งแล้ว</b>',
      `พนักงาน: <b>${escapeHtml(review.employeeName)}</b>`,
      `ตำแหน่งใหม่: ${escapeHtml(review.proposedPosition)}`,
    ].join('\n'));
    await this.notifyEmployee(review.employeeId, [
      '🎉 <b>อนุมัติเลื่อนตำแหน่งแล้ว</b>',
      `ตำแหน่งใหม่: ${escapeHtml(review.proposedPosition)}`,
      `มีผล: ${review.effectiveDate}`,
    ].join('\n'));
  }

  async notifyPromotionRejected(review: PromotionReviewResponse): Promise<void> {
    await this.notifyHr(review.companyId, [
      '❌ <b>ปฏิเสธการเลื่อนตำแหน่ง</b>',
      `พนักงาน: <b>${escapeHtml(review.employeeName)}</b>`,
    ].join('\n'));
  }

  async notifyPromotionApplied(review: PromotionReviewResponse): Promise<void> {
    await this.notifyEmployee(review.employeeId, [
      '🎉 <b>เลื่อนตำแหน่งมีผลแล้ว</b>',
      `ตำแหน่งใหม่: ${escapeHtml(review.proposedPosition)}`,
    ].join('\n'));
  }

  private async notifyOwners(companyId: string, text: string): Promise<void> {
    await this.sendToRoles(companyId, ['owner'], text);
  }

  private async notifyHr(companyId: string, text: string): Promise<void> {
    await this.sendToRoles(companyId, HR_ROLES, text);
  }

  private async sendToRoles(
    companyId: string,
    roles: BusinessRoleCode[],
    text: string,
  ): Promise<void> {
    const userIds = await this.resolveUserIdsByRoles(companyId, roles);
    await this.sendToUsers(userIds, text);
  }

  private async resolveUserIdsByRoles(
    companyId: string,
    roles: BusinessRoleCode[],
  ): Promise<string[]> {
    const assignments = await this.prisma.businessRoleAssignment.findMany({
      where: { role: { in: roles }, isActive: true, deletedAt: null },
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
        messageType: 'compensation_review_notice',
        telegramAccountId: account.id,
      }).catch(() => undefined);
    }
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
      messageType: 'compensation_review_notice',
      telegramAccountId: account.id,
    }).catch(() => undefined);
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
  return value.toLocaleString('th-TH', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
