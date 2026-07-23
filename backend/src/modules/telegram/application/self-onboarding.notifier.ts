// ============================================================================
// EMP-001c — Self-onboarding Telegram notifications
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import type { BusinessRoleCode } from '../../permission/domain/entities/business-role.types';

const HR_ROLES: BusinessRoleCode[] = ['owner', 'secretary'];

@Injectable()
export class SelfOnboardingTelegramNotifier {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
  ) {}

  async editResolvedReviewMessage(
    chatId: number,
    messageId: number,
    submissionId: string,
    outcome: 'approved' | 'rejected',
    reason?: string | null,
  ): Promise<boolean> {
    const text = await this.buildResolvedReviewText(submissionId, outcome, reason);
    if (!text) return false;
    const edited = await this.gateway.editMessageText(chatId, messageId, text);
    if (!edited) return false;
    await this.gateway.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
    return true;
  }

  private async buildPendingReviewText(submissionId: string): Promise<string | null> {
    const submission = await this.loadSubmission(submissionId);
    if (!submission) return null;
    return this.formatPendingReviewText(submission);
  }

  private async buildResolvedReviewText(
    submissionId: string,
    outcome: 'approved' | 'rejected',
    reason?: string | null,
  ): Promise<string | null> {
    const submission = await this.loadSubmission(submissionId);
    if (!submission) return null;
    const icon = outcome === 'approved' ? '✅' : '❌';
    const status = outcome === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติแล้ว';
    const lines = [
      `${icon} <b>ตรวจสอบพนักงาน${status}</b>`,
      '',
      ...this.formatSubmissionDetailLines(submission),
    ];
    if (outcome === 'rejected' && reason) {
      lines.push('', `เหตุผล: ${esc(reason)}`);
    }
    return lines.join('\n');
  }

  private async loadSubmission(submissionId: string) {
    return this.prisma.employeeSelfOnboardingSubmission.findUnique({
      where: { id: submissionId },
      include: {
        employee: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            nickname: true,
            globalId: true,
            assignments: {
              where: { effectiveTo: null, deletedAt: null },
              take: 1,
              select: {
                company: { select: { name: true } },
                team: { select: { name: true } },
              },
            },
          },
        },
        documents: { select: { id: true } },
      },
    });
  }

  private formatPendingReviewText(
    submission: NonNullable<Awaited<ReturnType<SelfOnboardingTelegramNotifier['loadSubmission']>>>,
  ): string {
    return [
      '📥 <b>มีข้อมูลพนักงานรอตรวจสอบ</b>',
      '',
      ...this.formatSubmissionDetailLines(submission),
    ].join('\n');
  }

  private formatSubmissionDetailLines(
    submission: NonNullable<Awaited<ReturnType<SelfOnboardingTelegramNotifier['loadSubmission']>>>,
  ): string[] {
    const emp = submission.employee;
    const assignment = emp.assignments[0];
    const data = submission.submittedDataJson as Record<string, unknown> | null;
    const name = String(data?.fullName ?? `${emp.firstName} ${emp.lastName}`.trim());
    return [
      `ชื่อ: ${esc(name)}`,
      `บริษัท: ${esc(assignment?.company?.name ?? '—')}`,
      `ทีม: ${esc(assignment?.team?.name ?? '—')}`,
      `เอกสารแนบ: ${submission.documents.length} ไฟล์`,
    ];
  }

  async notifyHrPendingReview(submissionId: string): Promise<void> {
    const text = await this.buildPendingReviewText(submissionId);
    if (!text) return;

    const submission = await this.loadSubmission(submissionId);
    if (!submission) return;

    const webBase = process.env.WEB_APP_BASE_URL ?? process.env.APP_URL ?? '';
    const reviewUrl = webBase ? `${webBase.replace(/\/$/, '')}/hr/self-onboarding` : null;

    const keyboard: Array<Array<{ text: string; callback_data?: string; url?: string }>> = [];
    if (reviewUrl) {
      keyboard.push([{ text: '🔎 เปิดตรวจสอบ', url: reviewUrl }]);
    }
    keyboard.push([
      { text: '✅ อนุมัติ', callback_data: `so_hr:approve:${submissionId}` },
      { text: '❌ ไม่อนุมัติ', callback_data: `so_hr:reject:${submissionId}` },
    ]);

    await this.sendToHr(submission.companyId, text, {
      inline_keyboard: keyboard as Array<Array<{ text: string; callback_data: string }>>,
    });
  }

  async notifyEmployeeApproved(employeeId: string): Promise<void> {
    await this.notifyEmployee(employeeId, [
      '✅ ลงทะเบียนสำเร็จ HR อนุมัติแล้ว',
      '',
      'พิมพ์ /start เพื่อเช็คอินและใช้งานระบบ',
    ].join('\n'));
  }

  async notifyEmployeeRejected(employeeId: string, reason: string): Promise<void> {
    await this.notifyEmployee(employeeId, [
      '❌ <b>HR ไม่อนุมัติข้อมูลที่ส่ง</b>',
      '',
      reason ? `เหตุผล: ${esc(reason)}` : '',
      '',
      'กรุณาแก้ไขและส่งข้อมูลใหม่อีกครั้งผ่าน Telegram',
    ].filter(Boolean).join('\n'));
  }

  private async sendToHr(
    companyId: string,
    text: string,
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> },
  ): Promise<void> {
    const userIds = await this.resolveUserIdsByRoles(companyId, HR_ROLES);
    await this.sendToUsers(userIds, text, replyMarkup);
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

  private async sendToUsers(
    userIds: string[],
    text: string,
    replyMarkup?: { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> },
  ): Promise<void> {
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
        messageType: 'self_onboarding_notice',
        telegramAccountId: account.id,
        replyMarkup,
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
      messageType: 'self_onboarding_notice',
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

function esc(v: string): string {
  return v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
