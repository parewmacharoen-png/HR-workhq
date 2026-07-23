// ============================================================================
// modules/workflow/application/approval-notification.service.ts
// HR-15 / REQ-005 notification hooks (Telegram + Web).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { StructuredLoggerService } from '../../../common/monitoring/structured-logger.service';
import type {
  ApprovalActionPayload,
  ApprovalNotificationHandler,
  ApprovalRequestedPayload,
} from './approval-notification.handler';

export type ApprovalNotificationEvent =
  | 'approval_requested'
  | 'approval_approved'
  | 'approval_rejected'
  | 'approval_escalated'
  | 'approval_reassigned';

@Injectable()
export class ApprovalNotificationService {
  private handlers: ApprovalNotificationHandler[] = [];

  constructor(
    private readonly prisma: PrismaService,
    private readonly log: StructuredLoggerService,
  ) {}

  registerHandler(handler: ApprovalNotificationHandler): void {
    this.handlers.push(handler);
  }

  async notifyApprovalRequested(input: ApprovalRequestedPayload): Promise<void> {
    await this.emit('approval_requested', input);
    await this.dispatch((h) => h.onApprovalRequested(input));
  }

  async notifyWorkflowAction(input: ApprovalActionPayload): Promise<void> {
    await this.emit(input.event, input);
    await this.dispatch((h) => h.onApprovalAction(input));
  }

  private async dispatch(fn: (h: ApprovalNotificationHandler) => Promise<void>): Promise<void> {
    for (const handler of this.handlers) {
      try {
        await fn(handler);
      } catch (err) {
        this.log.write({
          context: 'ApprovalNotification',
          level: 'error',
          message: 'handler_failed',
          error: String(err),
        });
      }
    }
  }

  private async emit(event: ApprovalNotificationEvent, payload: unknown): Promise<void> {
    this.log.write({
      context: 'ApprovalNotification',
      level: 'log',
      message: event,
      payload,
    });
  }
}
