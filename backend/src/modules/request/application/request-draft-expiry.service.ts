// ============================================================================
// Auto-cancel request drafts idle >24h and notify employees via Telegram.
// ============================================================================

import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { AuditService } from '../../../shared/audit/audit.service';
import { TelegramGatewayService } from '../../telegram/infrastructure/telegram-gateway.service';

const DRAFT_MAX_AGE_MS = 24 * 3_600_000;

@Injectable()
export class RequestDraftExpiryService {
  private readonly logger = new Logger(RequestDraftExpiryService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly dates: DateProvider,
    private readonly audit: AuditService,
    @Optional() private readonly telegram?: TelegramGatewayService,
  ) {}

  async expireStaleDrafts(): Promise<number> {
    const cutoff = new Date(this.dates.now().getTime() - DRAFT_MAX_AGE_MS);
    const drafts = await this.prisma.requestInstance.findMany({
      where: {
        deletedAt: null,
        status: 'draft',
        updatedAt: { lt: cutoff },
      },
      include: {
        requestType: { select: { nameTh: true, key: true } },
        requesterEmployee: { select: { id: true, firstName: true, nickname: true } },
      },
      take: 100,
    });

    let expired = 0;
    for (const draft of drafts) {
      try {
        await this.expireOne(draft);
        expired += 1;
      } catch (err) {
        this.logger.warn(`Failed to expire draft ${draft.id}`, err);
      }
    }
    if (expired > 0) {
      this.logger.log(`Expired ${expired} stale request draft(s)`);
    }
    return expired;
  }

  private async expireOne(draft: {
    id: string;
    title: string;
    requesterEmployeeId: string;
    requestType: { nameTh: string; key: string };
    requesterEmployee: { id: string; firstName: string; nickname: string | null };
  }): Promise<void> {
    const reason =
      'แบบร่างหมดอายุ (ไม่ได้ส่งภายใน 24 ชม.) — กรุณาส่งคำร้องใหม่หรือติดต่อหัวหน้าทีม';

    await this.prisma.$transaction(async (tx) => {
      await tx.requestInstance.update({
        where: { id: draft.id },
        data: {
          status: 'cancelled',
          cancelledAt: this.dates.now(),
          cancelledReason: reason,
        },
      });
      await tx.requestTimelineEvent.create({
        data: {
          requestInstanceId: draft.id,
          eventType: 'cancelled',
          actorUserId: SYSTEM_ACTOR.userId,
          message: reason,
        },
      });
    });

    await this.audit.record(SYSTEM_ACTOR, {
      entityType: 'RequestInstance',
      entityId: draft.id,
      action: 'auto_expire_draft',
      after: { reason },
    });

    await this.notifyEmployee(draft);
  }

  private async notifyEmployee(draft: {
    id: string;
    title: string;
    requesterEmployeeId: string;
    requestType: { nameTh: string };
    requesterEmployee: { nickname: string | null; firstName: string };
  }): Promise<void> {
    if (!this.telegram) return;

    const account = await this.prisma.telegramAccount.findFirst({
      where: {
        deletedAt: null,
        isActive: true,
        user: { employeeId: draft.requesterEmployeeId, deletedAt: null, isActive: true },
      },
      orderBy: { linkedAt: 'desc' },
    });
    if (!account?.chatId) return;

    const name = draft.requesterEmployee.nickname ?? draft.requesterEmployee.firstName;
    const text = [
      `⏱ <b>คำร้องแบบร่างหมดอายุแล้ว</b>`,
      '',
      `สวัสดี ${name}`,
      `ประเภท: ${draft.requestType.nameTh}`,
      `หัวข้อ: ${draft.title || draft.requestType.nameTh}`,
      '',
      'ระบบยกเลิกแบบร่างที่ไม่ได้กดส่งภายใน 24 ชั่วโมง',
      'กรุณา <b>ส่งคำร้องใหม่</b> จากเมนู Telegram',
      'หรือ <b>ติดต่อหัวหน้าทีม</b> หากต้องการความช่วยเหลือ',
    ].join('\n');

    await this.telegram.sendMessage({
      chatId: Number(account.chatId),
      text,
      parseMode: 'HTML',
      telegramAccountId: account.id,
      messageType: 'draft_expired',
    }).catch(() => undefined);
  }
}
