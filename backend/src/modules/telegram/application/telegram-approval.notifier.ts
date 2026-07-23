// ============================================================================
// modules/telegram/application/telegram-approval.notifier.ts
// REQ-005 — Universal Telegram approval push notifications.
// ============================================================================

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { ApprovalNotificationService } from '../../workflow/application/approval-notification.service';
import type {
  ApprovalActionPayload,
  ApprovalNotificationHandler,
  ApprovalRequestedPayload,
} from '../../workflow/application/approval-notification.handler';
import {
  ApprovalRequestContextService,
  escapeHtml,
} from './approval-request-context.service';
import { loadEmployeeApprovalDisplayContext } from '../../../shared/employee/employee-approval-display.util';
import { WorkflowEntityType } from '../../workflow/domain/entities/workflow.entity';

export type CustomApprovalReviewType =
  | 'salary_review'
  | 'promotion_review'
  | 'referral'
  | 'exit_settlement'
  | 'exit_case';

export interface CustomApprovalDisplay {
  requestTypeLabel: string;
  requesterName: string;
  companyName: string;
  teamName: string | null;
  positionName: string | null;
  createdAt: string;
  keyDetails: string;
}

function formatBaht(amount: number): string {
  return `฿${amount.toLocaleString('th-TH')}`;
}

@Injectable()
export class TelegramApprovalNotifier implements ApprovalNotificationHandler, OnModuleInit {
  private readonly logger = new Logger(TelegramApprovalNotifier.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly context: ApprovalRequestContextService,
    private readonly approvalNotifications: ApprovalNotificationService,
  ) {}

  onModuleInit(): void {
    this.approvalNotifications.registerHandler(this);
  }

  async onApprovalRequested(payload: ApprovalRequestedPayload): Promise<void> {
    const display = await this.context.loadForInstance(
      payload.workflowInstanceId,
      payload.entityType as WorkflowEntityType,
      payload.entityId,
      payload.companyId,
      payload.workflowType,
    );
    const text = this.formatApprovalMessage({
      ...display,
      positionName: display.positionName ?? null,
    });
    const keyboard = this.approvalKeyboard(payload.entityType, payload.workflowInstanceId);

    for (const userId of payload.approverUserIds) {
      await this.sendToUser(userId, text, keyboard, 'approval_request');
    }
  }

  async onApprovalAction(payload: ApprovalActionPayload): Promise<void> {
    if (payload.event === 'approval_approved') {
      if (payload.nextApproverUserIds?.length) {
        const workflowType = payload.workflowType
          ?? await this.context.resolveWorkflowType(
            payload.entityType as WorkflowEntityType,
            payload.entityId,
          );
        await this.onApprovalRequested({
          workflowInstanceId: payload.workflowInstanceId,
          workflowType: workflowType ?? payload.entityType,
          entityType: payload.entityType,
          entityId: payload.entityId,
          companyId: payload.companyId,
          approverUserIds: payload.nextApproverUserIds,
          submitterUserId: payload.submitterUserId ?? '',
        });
      }
      if (payload.terminalStatus === 'approved' && payload.submitterUserId) {
        await this.notifyRequester(payload.submitterUserId, payload, 'approved');
      }
    }

    if (payload.event === 'approval_rejected' && payload.submitterUserId) {
      await this.notifyRequester(payload.submitterUserId, payload, 'rejected');
    }
  }

  /** Push approval request for non-workflow review types (salary, promotion, referral). */
  async notifyCustomApproval(input: {
    reviewType: 'salary_review' | 'promotion_review' | 'referral' | 'exit_settlement' | 'exit_case';
    reviewId: string;
    approverUserIds: string[];
    display: {
      requestTypeLabel: string;
      requesterName: string;
      companyName: string;
      teamName: string | null;
      positionName?: string | null;
      createdAt: string;
      keyDetails: string;
    };
  }): Promise<void> {
    const text = this.formatApprovalMessage({
      requestTypeLabel: input.display.requestTypeLabel,
      requesterName: input.display.requesterName,
      companyName: input.display.companyName,
      teamName: input.display.teamName,
      positionName: input.display.positionName ?? null,
      createdAt: input.display.createdAt,
      keyDetails: input.display.keyDetails,
    });
    const keyboard = this.customApprovalKeyboard(input.reviewType, input.reviewId);
    for (const userId of input.approverUserIds) {
      await this.sendToUser(userId, text, keyboard, 'custom_approval_request');
    }
  }

  private formatApprovalMessage(display: {
    requestTypeLabel: string;
    requesterName: string;
    companyName: string;
    teamName: string | null;
    positionName: string | null;
    createdAt: string;
    keyDetails: string;
  }, header = '📋 <b>คำร้องใหม่</b>'): string {
    return [
      header,
      '',
      `<b>ประเภทคำร้อง</b>\n${escapeHtml(display.requestTypeLabel)}`,
      `<b>ผู้ขอ</b>\n${escapeHtml(display.requesterName)}`,
      `<b>บริษัท</b>\n${escapeHtml(display.companyName)}`,
      `<b>ทีม</b>\n${escapeHtml(display.teamName ?? '—')}`,
      `<b>ตำแหน่ง</b>\n${escapeHtml(display.positionName ?? '—')}`,
      `<b>วันที่สร้าง</b>\n${escapeHtml(display.createdAt)}`,
      `<b>รายละเอียดสำคัญ</b>\n${escapeHtml(display.keyDetails)}`,
    ].join('\n');
  }

  formatResolvedApprovalMessage(
    display: {
      requestTypeLabel: string;
      requesterName: string;
      companyName: string;
      teamName: string | null;
      positionName: string | null;
      createdAt: string;
      keyDetails: string;
    },
    outcome: 'approved' | 'rejected',
    comment?: string | null,
  ): string {
    const icon = outcome === 'approved' ? '✅' : '❌';
    const header = `${icon} <b>คำร้อง${outcome === 'approved' ? 'อนุมัติแล้ว' : 'ไม่อนุมัติแล้ว'}</b>`;
    const lines = [this.formatApprovalMessage(display, header)];
    if (outcome === 'rejected' && comment) {
      lines.push(`\n<b>เหตุผล</b>\n${escapeHtml(comment)}`);
    }
    return lines.join('');
  }

  async loadCustomApprovalDisplay(
    reviewType: string,
    reviewId: string,
  ): Promise<CustomApprovalDisplay | null> {
    switch (reviewType) {
      case 'salary_review': {
        const row = await this.prisma.salaryReview.findFirst({
          where: { id: reviewId, deletedAt: null },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, nickname: true } },
            company: { select: { name: true } },
          },
        });
        if (!row) return null;
        const org = await loadEmployeeApprovalDisplayContext(this.prisma, row.employeeId, row.companyId);
        const name = row.employee.nickname
          ?? `${row.employee.firstName} ${row.employee.lastName}`.trim();
        const current = Number(row.currentSalary);
        const proposed = Number(row.proposedSalary);
        const salaryLine = current <= 0
          ? `เงินเดือนใหม่ ${formatBaht(proposed)}`
          : `จาก ${formatBaht(current)} → ${formatBaht(proposed)}`;
        return {
          requestTypeLabel: 'อนุมัติปรับเงินเดือน',
          requesterName: name,
          companyName: org.companyName ?? row.company.name,
          teamName: org.teamName,
          positionName: org.position,
          createdAt: row.createdAt.toISOString(),
          keyDetails: `${salaryLine}\nมีผล: ${row.effectiveDate.toISOString().slice(0, 10)}`,
        };
      }
      case 'promotion_review': {
        const row = await this.prisma.promotionReview.findFirst({
          where: { id: reviewId, deletedAt: null },
          include: {
            employee: { select: { id: true, firstName: true, lastName: true, nickname: true } },
            company: { select: { name: true } },
          },
        });
        if (!row) return null;
        const org = await loadEmployeeApprovalDisplayContext(this.prisma, row.employeeId, row.companyId);
        const name = row.employee.nickname
          ?? `${row.employee.firstName} ${row.employee.lastName}`.trim();
        return {
          requestTypeLabel: 'อนุมัติเลื่อนตำแหน่ง',
          requesterName: name,
          companyName: org.companyName ?? row.company.name,
          teamName: org.teamName,
          positionName: org.position,
          createdAt: row.createdAt.toISOString(),
          keyDetails: `${row.currentPosition ?? '—'} → ${row.proposedPosition}\nมีผล: ${row.effectiveDate.toISOString().slice(0, 10)}`,
        };
      }
      case 'referral': {
        const row = await this.prisma.employeeReferral.findFirst({
          where: { id: reviewId },
          include: {
            referrerEmployee: { select: { firstName: true, lastName: true, nickname: true } },
            referralProgram: { select: { bonusAmount: true } },
            company: { select: { name: true } },
          },
        });
        if (!row) return null;
        const name = row.referrerEmployee.nickname
          ?? `${row.referrerEmployee.firstName} ${row.referrerEmployee.lastName}`.trim();
        return {
          requestTypeLabel: 'อนุมัติโบนัสแนะนำเพื่อน',
          requesterName: name,
          companyName: row.company.name,
          teamName: null,
          positionName: null,
          createdAt: row.submittedAt.toISOString().slice(0, 16).replace('T', ' '),
          keyDetails: `ผู้สมัคร: ${row.candidateName}\nโบนัส: ${formatBaht(Number(row.referralProgram?.bonusAmount ?? 2000))}`,
        };
      }
      case 'exit_settlement': {
        const row = await this.prisma.finalPayrollSettlement.findFirst({
          where: { id: reviewId },
          include: {
            employee: { select: { firstName: true, lastName: true, nickname: true } },
            company: { select: { name: true } },
          },
        });
        if (!row) return null;
        const name = row.employee.nickname
          ?? `${row.employee.firstName} ${row.employee.lastName}`.trim();
        return {
          requestTypeLabel: 'อนุมัติค่าจ้างสุดท้าย',
          requesterName: name,
          companyName: row.company.name,
          teamName: null,
          positionName: null,
          createdAt: row.createdAt.toISOString().slice(0, 16).replace('T', ' '),
          keyDetails: `ยอดสุทธิ: ${formatBaht(Number(row.netPayableAmount))}`,
        };
      }
      case 'exit_case': {
        const row = await this.prisma.employeeExitCase.findFirst({
          where: { id: reviewId, deletedAt: null },
          include: {
            employee: { select: { firstName: true, lastName: true, nickname: true } },
            company: { select: { name: true } },
          },
        });
        if (!row) return null;
        const name = row.employee.nickname
          ?? `${row.employee.firstName} ${row.employee.lastName}`.trim();
        return {
          requestTypeLabel: 'อนุมัติคำขอลาออก',
          requesterName: name,
          companyName: row.company.name,
          teamName: null,
          positionName: null,
          createdAt: row.createdAt.toISOString().slice(0, 16).replace('T', ' '),
          keyDetails: `วันที่มีผล: ${row.effectiveTerminationDate.toISOString().slice(0, 10)}`,
        };
      }
      default:
        return null;
    }
  }

  async editResolvedCustomApprovalMessage(
    chatId: number,
    messageId: number,
    reviewType: string,
    reviewId: string,
    outcome: 'approved' | 'rejected',
    comment?: string | null,
  ): Promise<boolean> {
    const display = await this.loadCustomApprovalDisplay(reviewType, reviewId);
    if (!display) return false;
    const text = this.formatResolvedApprovalMessage(display, outcome, comment);
    const edited = await this.gateway.editMessageText(chatId, messageId, text);
    if (!edited) return false;
    await this.gateway.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
    return true;
  }

  async editResolvedApprovalMessage(
    chatId: number,
    messageId: number,
    instanceId: string,
    entityType: WorkflowEntityType,
    companyId: string | null,
    workflowType: string | null | undefined,
    outcome: 'approved' | 'rejected',
    comment?: string | null,
  ): Promise<boolean> {
    const inst = await this.prisma.workflowInstance.findFirst({
      where: { id: instanceId, deletedAt: null },
    });
    if (!inst) return false;

    const resolvedType = workflowType
      ?? await this.context.resolveWorkflowType(entityType, inst.entityId);
    const display = await this.context.loadForInstance(
      instanceId,
      entityType,
      inst.entityId,
      companyId ?? inst.companyId,
      resolvedType,
    );
    const text = this.formatResolvedApprovalMessage(display, outcome, comment);
    const edited = await this.gateway.editMessageText(chatId, messageId, text);
    if (!edited) return false;
    await this.gateway.editMessageReplyMarkup(chatId, messageId, { inline_keyboard: [] });
    return true;
  }

  private approvalKeyboard(entityType: string, instanceId: string) {
    return {
      inline_keyboard: [
        [
          { text: '✅ อนุมัติ', callback_data: `approve:${entityType}:${instanceId}` },
          { text: '❌ ไม่อนุมัติ', callback_data: `reject:${entityType}:${instanceId}` },
        ],
        [{ text: '🔎 ดูรายละเอียด', callback_data: `detail:${entityType}:${instanceId}` }],
      ],
    };
  }

  private customApprovalKeyboard(reviewType: string, reviewId: string) {
    return {
      inline_keyboard: [
        [
          { text: '✅ อนุมัติ', callback_data: `approve:${reviewType}:${reviewId}` },
          { text: '❌ ไม่อนุมัติ', callback_data: `reject:${reviewType}:${reviewId}` },
        ],
        [{ text: '🔎 ดูรายละเอียด', callback_data: `detail:${reviewType}:${reviewId}` }],
      ],
    };
  }

  private async notifyRequester(
    submitterUserId: string,
    payload: ApprovalActionPayload,
    outcome: 'approved' | 'rejected',
  ): Promise<void> {
    const display = await this.context.loadForInstance(
      payload.workflowInstanceId,
      payload.entityType as WorkflowEntityType,
      payload.entityId,
      payload.companyId,
      payload.workflowType ?? null,
    );
    const text = this.formatResolvedApprovalMessage(
      display,
      outcome,
      payload.comment,
    );
    await this.sendToUser(submitterUserId, text, undefined, 'approval_outcome');
  }

  private async sendToUser(
    userId: string,
    text: string,
    replyMarkup?: unknown,
    messageType?: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    if (!user) return;

    const account = await this.prisma.telegramAccount.findFirst({
      where: { userId, isActive: true, deletedAt: null },
      select: { id: true, chatId: true },
    });
    if (!account?.chatId) return;

    try {
      await this.gateway.sendMessage({
        chatId: Number(account.chatId),
        text,
        parseMode: 'HTML',
        replyMarkup,
        telegramAccountId: account.id,
        messageType: messageType ?? 'approval_notice',
      });
    } catch (err) {
      this.logger.warn(`Failed to send approval Telegram to user ${userId}`, err);
    }
  }
}
