import { Inject, Injectable, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';
import { UnifiedApprovalInboxService, UnifiedApprovalItem } from './unified-approval-inbox.service';
import { RequestApprovalService } from '../../request/application/request-approval.service';
import { WorkflowService } from '../../workflow/application/workflow.service';
import { WorkflowApproverService } from '../../workflow/application/workflow-approver.service';
import { SalaryReviewService } from '../../salary-review/application/salary-review.service';
import { PromotionReviewService } from '../../salary-review/application/promotion-review.service';
import { ExitCaseService } from '../../exit/application/exit-case.service';
import { ActorContext } from '../../../shared/kernel/actor-context';

function tgActor(userId: string, companyId: string | null): ActorContext {
  return { userId, companyId, impersonatorUserId: null };
}

interface SessionLike {
  id: string;
  userId: string;
}

@Injectable()
export class UnifiedApprovalInboxHandler {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TelegramGatewayService,
    private readonly inbox: UnifiedApprovalInboxService,
    @Inject(forwardRef(() => RequestApprovalService))
    private readonly requestApproval: RequestApprovalService,
    private readonly workflow: WorkflowService,
    private readonly workflowApprover: WorkflowApproverService,
    @Inject(forwardRef(() => SalaryReviewService))
    private readonly salaryReviews: SalaryReviewService,
    @Inject(forwardRef(() => PromotionReviewService))
    private readonly promotionReviews: PromotionReviewService,
    @Inject(forwardRef(() => ExitCaseService))
    private readonly exitCases: ExitCaseService,
  ) {}

  async showInbox(
    account: SessionLike,
    chatId: number,
    companyId: string | null,
  ): Promise<void> {
    const items = await this.inbox.listPendingForActor(account.userId, companyId, 10);
    if (!items.length) {
      await this.gateway.sendMessage({
        chatId,
        text: '✅ ไม่มีงานรออนุมัติ',
        replyMarkup: { inline_keyboard: [[{ text: '🔙 กลับ', callback_data: 'home' }]] },
      });
      return;
    }

    await this.gateway.sendMessage({
      chatId,
      text: '📥 <b>งานรออนุมัติ</b>\nเลือกรายการด้านล่าง',
      parseMode: 'HTML',
    });

    for (const item of items.slice(0, 5)) {
      await this.sendItemCard(chatId, item);
    }
  }

  async handleCallback(
    account: SessionLike,
    chatId: number,
    data: string,
    companyId: string | null,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
  ): Promise<boolean> {
    if (data === 'unified:inbox' || data === 'unified:inbox:refresh') {
      await this.showInbox(account, chatId, companyId);
      return true;
    }

    const approveMatch = data.match(/^unified:approve:([^:]+):(.+)$/);
    if (approveMatch) {
      await this.approveItem(account, chatId, approveMatch[1], approveMatch[2], companyId);
      return true;
    }

    const rejectMatch = data.match(/^unified:reject:([^:]+):(.+)$/);
    if (rejectMatch) {
      await this.startRejectFlow(account, chatId, rejectMatch[1], rejectMatch[2], saveSession);
      return true;
    }

    return false;
  }

  async handleRejectText(
    account: SessionLike,
    chatId: number,
    text: string,
    context: Record<string, unknown>,
    companyId: string | null,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
  ): Promise<boolean> {
    const draft = context.draft as { source?: string; id?: string; entityType?: string } | undefined;
    if (!draft?.source || !draft.id) return false;

    await this.rejectItem(account, chatId, draft.source, draft.id, text.trim(), companyId, draft.entityType);
    await saveSession('idle', {});
    return true;
  }

  private async sendItemCard(chatId: number, item: UnifiedApprovalItem): Promise<void> {
    const date = item.submittedAt.slice(0, 10);
    await this.gateway.sendMessage({
      chatId,
      text: `• <b>${item.title}</b>\n${item.subtitle}\n📅 ${date}`,
      parseMode: 'HTML',
      replyMarkup: {
        inline_keyboard: [[
          { text: '✅ อนุมัติ', callback_data: `unified:approve:${item.source}:${item.id}` },
          { text: '❌ ไม่อนุมัติ', callback_data: `unified:reject:${item.source}:${item.id}` },
        ]],
      },
    });
  }

  private async approveItem(
    account: SessionLike,
    chatId: number,
    source: string,
    id: string,
    companyId: string | null,
  ): Promise<void> {
    const actor = tgActor(account.userId, companyId);
    try {
      switch (source) {
        case 'request':
          await this.requestApproval.approve(actor, id, { note: 'Approved via unified inbox' });
          break;
        case 'workflow': {
          const allowed = await this.workflowApprover.isActorCurrentApprover(account.userId, id);
          if (!allowed) throw new Error('คุณไม่มีสิทธิ์อนุมัติรายการนี้');
          await this.workflow.act(actor, id, {
            action: 'approve',
            comment: 'Approved via unified inbox',
            channel: 'telegram',
          });
          break;
        }
        case 'salary_review':
          await this.salaryReviews.approve(actor, id);
          break;
        case 'promotion_review':
          await this.promotionReviews.approve(actor, id);
          break;
        case 'exit_leader':
          await this.exitCases.leaderReviewFromTelegram(actor, id, { notes: 'Approved via unified inbox' });
          break;
        case 'exit_owner':
          await this.exitCases.ownerReview(actor, id, { notes: 'Approved via unified inbox' });
          break;
        default:
          throw new Error('Unsupported approval source');
      }
      await this.gateway.sendMessage({ chatId, text: '✅ อนุมัติแล้ว' });
    } catch (err: unknown) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }

  private async startRejectFlow(
    account: SessionLike,
    chatId: number,
    source: string,
    id: string,
    saveSession: (state: string, context: Record<string, unknown>) => Promise<void>,
  ): Promise<void> {
    let entityType: string | undefined;
    if (source === 'workflow') {
      const inst = await this.prisma.workflowInstance.findFirst({
        where: { id, deletedAt: null },
        select: { entityType: true },
      });
      entityType = inst?.entityType ?? undefined;
    }

    await saveSession('unified:rejecting', {
      draft: { source, id, entityType },
    });
    await this.gateway.sendMessage({ chatId, text: 'กรุณาระบุเหตุผลที่ไม่อนุมัติ' });
  }

  private async rejectItem(
    account: SessionLike,
    chatId: number,
    source: string,
    id: string,
    reason: string,
    companyId: string | null,
    entityType?: string,
  ): Promise<void> {
    const actor = tgActor(account.userId, companyId);
    try {
      switch (source) {
        case 'request':
          await this.requestApproval.reject(actor, id, { note: reason });
          break;
        case 'workflow': {
          const allowed = await this.workflowApprover.isActorCurrentApprover(account.userId, id);
          if (!allowed) throw new Error('คุณไม่มีสิทธิ์ปฏิเสธรายการนี้');
          await this.workflow.act(actor, id, {
            action: 'reject',
            comment: reason,
            channel: 'telegram',
          });
          break;
        }
        case 'salary_review':
          await this.salaryReviews.reject(actor, id, { reason });
          break;
        case 'promotion_review':
          await this.promotionReviews.reject(actor, id, { reason });
          break;
        case 'exit_leader':
        case 'exit_owner':
          await this.exitCases.rejectReviewFromTelegram(actor, id, reason);
          break;
        default:
          throw new Error('Unsupported rejection source');
      }
      await this.gateway.sendMessage({ chatId, text: '❌ ปฏิเสธแล้ว' });
    } catch (err: unknown) {
      await this.gateway.sendMessage({ chatId, text: `❌ ${(err as Error).message}` });
    }
  }
}
