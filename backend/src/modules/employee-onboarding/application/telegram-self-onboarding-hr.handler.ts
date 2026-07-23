// ============================================================================
// EMP-001c — HR Telegram callbacks for self-onboarding review
// ============================================================================

import { Injectable, ForbiddenException } from '@nestjs/common';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';
import { SelfOnboardingTelegramNotifier } from '../../telegram/application/self-onboarding.notifier';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { EmployeeOnboardingApprovalService } from './employee-onboarding-approval.service';
import { EmployeeSelfOnboardingService } from './employee-self-onboarding.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { SessionContext, TelegramState } from '../../telegram/domain/entities/telegram-session.types';
import {
  normalizeCallbackSourceMessage,
  type TelegramSourceMessage,
} from '../../telegram/application/telegram-callback-message.util';

type SaveSessionFn = (state: TelegramState, context: SessionContext) => Promise<void>;

@Injectable()
export class TelegramSelfOnboardingHrHandler {
  constructor(
    private readonly onboardingApproval: EmployeeOnboardingApprovalService,
    private readonly selfOnboarding: EmployeeSelfOnboardingService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly gateway: TelegramGatewayService,
    private readonly selfOnboardingNotifier: SelfOnboardingTelegramNotifier,
  ) {}

  async handleCallback(
    account: { id: string; userId: string },
    chatId: number,
    data: string,
    saveSession?: SaveSessionFn,
    sourceMessage?: TelegramSourceMessage,
  ): Promise<boolean> {
    if (!data.startsWith('so_hr:')) return false;

    const [, action, submissionId] = data.split(':');
    if (!submissionId) return true;

    try {
      const submission = await this.selfOnboarding.getSubmission(submissionId);
      const actor: ActorContext = {
        userId: account.userId,
        companyId: submission.companyId,
        impersonatorUserId: null,
      };
      await this.employeeAccess.assertEmployeeWritable(actor, submission.employeeId, submission.companyId);

      if (action === 'approve') {
        if (submission.status === 'approved') {
          await this.gateway.sendMessage({
            chatId,
            text: '✅ อนุมัติไปแล้ว — ไม่ต้องกดซ้ำ',
            telegramAccountId: account.id,
          });
          return true;
        }
        if (submission.status === 'rejected') {
          await this.gateway.sendMessage({
            chatId,
            text: '❌ คำขอนี้ถูกปฏิเสธไปแล้ว',
            telegramAccountId: account.id,
          });
          return true;
        }
        await this.onboardingApproval.approveFromSubmission(actor, submissionId);
        const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
        let messageUpdated = false;
        if (source) {
          messageUpdated = await this.selfOnboardingNotifier.editResolvedReviewMessage(
            source.chat.id,
            source.message_id,
            submissionId,
            'approved',
          );
        }
        if (!messageUpdated) {
          await this.gateway.sendMessage({
            chatId,
            text: '✅ อนุมัติการรับพนักงานและเชื่อม Telegram แล้ว',
            telegramAccountId: account.id,
          });
        }
        return true;
      }

      if (action === 'reject') {
        if (!saveSession) {
          await this.onboardingApproval.rejectFromSubmission(actor, submissionId, 'ไม่อนุมัติโดย HR');
          const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
          let messageUpdated = false;
          if (source) {
            messageUpdated = await this.selfOnboardingNotifier.editResolvedReviewMessage(
              source.chat.id,
              source.message_id,
              submissionId,
              'rejected',
              'ไม่อนุมัติโดย HR',
            );
          }
          if (!messageUpdated) {
            await this.gateway.sendMessage({
              chatId,
              text: '❌ ปฏิเสธการรับพนักงานแล้ว',
              telegramAccountId: account.id,
            });
          }
          return true;
        }

        await saveSession('custom:rejecting', {
          draft: { reviewId: submissionId, entityType: 'self_onboarding_submission', sourceMessage },
        });
        await this.gateway.sendMessage({
          chatId,
          text: 'กรุณาพิมพ์เหตุผลที่ไม่อนุมัติ (หรือพิมพ์ "ยกเลิก" เพื่อยกเลิก)',
          telegramAccountId: account.id,
        });
        return true;
      }
    } catch (err) {
      const msg = err instanceof ForbiddenException
        ? '❌ คุณไม่มีสิทธิ์ตรวจสอบรายการนี้'
        : `❌ ${(err as Error).message}`;
      await this.gateway.sendMessage({ chatId, text: msg, telegramAccountId: account.id });
      return true;
    }

    return true;
  }

  async handleRejectText(
    account: { id: string; userId: string },
    chatId: number,
    text: string,
    ctx: SessionContext,
    saveSession: SaveSessionFn,
  ): Promise<boolean> {
    if (ctx.draft?.entityType !== 'self_onboarding_submission') return false;
    const submissionId = ctx.draft.reviewId as string | undefined;
    if (!submissionId) return false;

    if (text.trim() === 'ยกเลิก') {
      await saveSession('idle', {});
      await this.gateway.sendMessage({
        chatId,
        text: 'ยกเลิกการปฏิเสธแล้ว',
        telegramAccountId: account.id,
      });
      return true;
    }

    const submission = await this.selfOnboarding.getSubmission(submissionId);
    const actor: ActorContext = {
      userId: account.userId,
      companyId: submission.companyId,
      impersonatorUserId: null,
    };

    try {
      await this.onboardingApproval.rejectFromSubmission(actor, submissionId, text.trim());
      const sourceMessage = ctx.draft?.sourceMessage as TelegramSourceMessage | undefined;
      const source = normalizeCallbackSourceMessage(sourceMessage, chatId);
      let messageUpdated = false;
      if (source) {
        messageUpdated = await this.selfOnboardingNotifier.editResolvedReviewMessage(
          source.chat.id,
          source.message_id,
          submissionId,
          'rejected',
          text.trim(),
        );
      }
      if (!messageUpdated) {
        await this.gateway.sendMessage({
          chatId,
          text: '❌ ปฏิเสธการรับพนักงานแล้ว',
          telegramAccountId: account.id,
        });
      }
      await saveSession('idle', {});
    } catch (err) {
      await this.gateway.sendMessage({
        chatId,
        text: `❌ ${(err as Error).message}`,
        telegramAccountId: account.id,
      });
    }

    return true;
  }
}
