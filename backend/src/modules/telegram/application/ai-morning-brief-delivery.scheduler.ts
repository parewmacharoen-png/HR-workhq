// ============================================================================
// AI Morning Brief delivery — 08:00 Asia/Bangkok via SchedulerTimeProvider
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';
import { AuditService } from '../../../shared/audit/audit.service';
import { SYSTEM_ACTOR } from '../../../shared/kernel/actor-context';
import { AiMorningBriefService } from '../../ai/application/ai-manager.service';
import { TelegramGatewayService } from '../infrastructure/telegram-gateway.service';

const BRIEF_HOUR = 8;
const BRIEF_MINUTE = 0;
const LOCK_TTL_SEC = 3_600;

@Injectable()
export class AiMorningBriefDeliveryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AiMorningBriefDeliveryScheduler.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly brief: AiMorningBriefService,
    private readonly gateway: TelegramGatewayService,
    private readonly lock: RedisLockService,
    private readonly dates: DateProvider,
    private readonly schedulerTimes: SchedulerTimeProvider,
    private readonly audit: AuditService,
  ) {}

  onModuleInit(): void {
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(): void {
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(BRIEF_HOUR, BRIEF_MINUTE, now);
    const delay = Math.max(0, next.getTime() - now.getTime());
    this.timer = setTimeout(() => {
      this.runDelivery().catch((err) => this.logger.error('Morning brief delivery failed', err));
      this.scheduleNext();
    }, delay);
    if (this.timer.unref) this.timer.unref();
  }

  async runDelivery(): Promise<void> {
    const dateKey = this.schedulerTimes.dateKey();
    const lockKey = `workhq:ai-morning-brief:${dateKey}`;
    const acquired = await this.lock.acquire(lockKey, LOCK_TTL_SEC);
    if (!acquired) {
      this.logger.log(`Skipping AI morning brief — lock held (${lockKey})`);
      return;
    }
    try {
      await this.deliverAll();
    } finally {
      await this.lock.release(lockKey);
    }
  }

  async deliverAll(): Promise<void> {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true, deletedAt: null },
    });
    for (const company of companies) {
      const recipients = await this.resolveRecipients(company.id);
      for (const recipient of recipients) {
        await this.deliverToRecipient(company.id, company.name, recipient);
      }
    }
  }

  private async resolveRecipients(companyId: string): Promise<Array<{
    userId: string;
    employeeId: string;
    role: 'owner' | 'secretary' | 'big_leader';
    chatId: number | null;
  }>> {
    const users = await this.prisma.user.findMany({
      where: {
        deletedAt: null,
        isActive: true,
        employee: { assignments: { some: { companyId, effectiveTo: null } } },
      },
      include: {
        employee: true,
        userRoles: { where: { deletedAt: null }, include: { role: { select: { code: true } } } },
        telegramAccounts: { where: { deletedAt: null, isActive: true }, take: 1 },
      },
    });

    const secretaryIds = new Set(
      (await this.prisma.businessRoleAssignment.findMany({
        where: { role: 'secretary', isActive: true, deletedAt: null },
        select: { userId: true },
      })).map((r) => r.userId),
    );

    const out: Array<{
      userId: string;
      employeeId: string;
      role: 'owner' | 'secretary' | 'big_leader';
      chatId: number | null;
    }> = [];

    for (const user of users) {
      if (!user.employee?.id) continue;
      const codes = new Set(user.userRoles.map((r) => r.role.code));
      const chatId = user.telegramAccounts[0]?.chatId
        ? Number(user.telegramAccounts[0].chatId)
        : null;
      if (codes.has('owner') || codes.has('super_admin')) {
        out.push({ userId: user.id, employeeId: user.employee.id, role: 'owner', chatId });
      } else if (secretaryIds.has(user.id)) {
        out.push({ userId: user.id, employeeId: user.employee.id, role: 'secretary', chatId });
      } else if (codes.has('big_leader')) {
        out.push({ userId: user.id, employeeId: user.employee.id, role: 'big_leader', chatId });
      }
    }
    return out;
  }

  private async deliverToRecipient(
    companyId: string,
    companyName: string,
    recipient: { userId: string; employeeId: string; role: string; chatId: number | null },
  ): Promise<void> {
    try {
      const brief = await this.brief.generateForCompany(
        companyId,
        recipient.employeeId,
        recipient.role as 'owner' | 'secretary' | 'big_leader',
      );
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'AiMorningBrief',
        entityId: brief.id,
        action: 'morning_brief_generated',
        after: { companyId, recipientEmployeeId: recipient.employeeId },
      });

      if (!recipient.chatId) {
        await this.prisma.aiMorningBrief.update({
          where: { id: brief.id },
          data: { deliveryStatus: 'failed' },
        });
        await this.audit.record(SYSTEM_ACTOR, {
          entityType: 'AiMorningBrief',
          entityId: brief.id,
          action: 'morning_brief_failed',
          after: { reason: 'no_telegram_chat' },
        });
        return;
      }

      const dateLabel = new Intl.DateTimeFormat('th-TH', {
        timeZone: 'Asia/Bangkok',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(this.dates.now());
      const text = formatMorningBriefTelegram(companyName, dateLabel, brief.sectionsJson as Record<string, number>);
      await this.gateway.sendMessage({
        chatId: recipient.chatId,
        text,
        parseMode: 'HTML',
        replyMarkup: {
          inline_keyboard: [
            [
              { text: '🔎 ดูรายละเอียด', callback_data: 'ai:brief:detail' },
              { text: '📥 งานรออนุมัติ', callback_data: 'unified:inbox' },
            ],
            [
              { text: '🚨 Attendance Alerts', callback_data: 'attendance:alerts' },
              { text: '🤖 AI Manager', callback_data: 'ai:manager:menu' },
            ],
          ],
        },
      });

      await this.prisma.aiMorningBrief.update({
        where: { id: brief.id },
        data: { deliveryStatus: 'sent' },
      });
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'AiMorningBrief',
        entityId: brief.id,
        action: 'morning_brief_sent',
        after: { chatId: recipient.chatId },
      });
    } catch (err) {
      this.logger.warn(`Brief delivery failed for ${recipient.userId}: ${err}`);
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'AiMorningBrief',
        entityId: companyId,
        action: 'morning_brief_failed',
        after: { error: String(err) },
      });
    }
  }
}

export function formatMorningBriefTelegram(
  companyName: string,
  dateLabel: string,
  sections: Record<string, number>,
): string {
  return [
    '📊 <b>สรุป WorkHQ วันนี้</b>',
    '',
    `วันที่: ${dateLabel}`,
    `บริษัท: ${companyName}`,
    '',
    'วันนี้มี:',
    `• คนหยุด: ${sections.offToday ?? 0}`,
    `• คำร้องรออนุมัติ: ${sections.pendingApprovals ?? 0}`,
    `• แจ้งเตือนเวลาเข้างาน: ${sections.attendanceAlerts ?? 0}`,
    `• ใกล้ผ่านโปร: ${sections.probationEnding ?? 0}`,
    `• เอกสารต้องดำเนินการ: ${sections.documentsExpiring ?? 0}`,
    `• ประกาศยังไม่รับทราบ: ${sections.announcementsUnacked ?? 0}`,
    `• Training ค้าง: ${sections.trainingOverdue ?? 0}`,
    `• เรื่องด่วน: ${sections.urgentRisks ?? 0}`,
  ].join('\n');
}
