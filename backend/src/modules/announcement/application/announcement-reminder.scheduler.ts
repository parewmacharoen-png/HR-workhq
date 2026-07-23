// ============================================================================
// modules/announcement/application/announcement-reminder.scheduler.ts
// ANN-001 — daily Bangkok reminder for unopened (24h) / unacknowledged (72h)
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { AnnouncementReminderNotifier } from './announcement-reminder.notifier';

const SYSTEM_ACTOR: ActorContext = {
  userId: '00000000-0000-4000-8000-000000000001',
  impersonatorUserId: null,
  companyId: null,
};

const HOURS_24_MS = 24 * 60 * 60 * 1000;
const HOURS_72_MS = 72 * 60 * 60 * 1000;

@Injectable()
export class AnnouncementReminderScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AnnouncementReminderScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly LOCK_TTL_SEC = 3_600;
  private static readonly RUN_AT = '08:00';

  constructor(
    private readonly prisma: PrismaService,
    private readonly lock: RedisLockService,
    private readonly notifier: AnnouncementReminderNotifier,
    private readonly audit: AuditService,
    private readonly dates: DateProvider,
    private readonly schedulerTimes: SchedulerTimeProvider,
  ) {}

  onModuleInit(): void {
    this.scheduleNext();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  private scheduleNext(): void {
    const [h, m] = AnnouncementReminderScheduler.RUN_AT.split(':').map(Number) as [number, number];
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(h, m, now);
    this.timer = setTimeout(() => {
      this.runDaily()
        .catch((err) => this.logger.error('Announcement reminder job failed', err))
        .finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
  }

  async runDaily(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const dateKey = this.schedulerTimes.dateKey(ref);
    const lockKey = `workhq:announcement-reminder:${dateKey}`;
    const acquired = await this.lock.acquire(lockKey, AnnouncementReminderScheduler.LOCK_TTL_SEC);
    if (!acquired) return;

    try {
      await this.processUnopened(ref);
      await this.processUnacknowledged(ref);
    } finally {
      await this.lock.release(lockKey);
    }
  }

  private async processUnopened(asOf: Date): Promise<void> {
    const cutoff = new Date(asOf.getTime() - HOURS_24_MS);
    const deliveries = await this.prisma.announcementDelivery.findMany({
      where: {
        openedAt: null,
        openedReminderSentAt: null,
        deliveredAt: { not: null, lte: cutoff },
        announcement: { status: 'published', deletedAt: null },
      },
      select: { id: true, announcementId: true },
    });

    for (const d of deliveries) {
      await this.notifier.sendUnopenedReminder(d.id);
      await this.prisma.announcementDelivery.update({
        where: { id: d.id },
        data: { openedReminderSentAt: asOf },
      });
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'AnnouncementDelivery',
        entityId: d.id,
        action: 'announcement_reminder_sent',
        after: { kind: 'unopened', announcementId: d.announcementId },
      });
    }
  }

  private async processUnacknowledged(asOf: Date): Promise<void> {
    const cutoff = new Date(asOf.getTime() - HOURS_72_MS);
    const deliveries = await this.prisma.announcementDelivery.findMany({
      where: {
        acknowledgedAt: null,
        ackReminderSentAt: null,
        deliveredAt: { not: null, lte: cutoff },
        announcement: { status: 'published', deletedAt: null, mustAcknowledge: true },
      },
      include: { announcement: { select: { id: true, companyId: true, title: true } } },
    });

    for (const d of deliveries) {
      await this.notifier.sendUnacknowledgedReminder(d.id);
      await this.prisma.announcementDelivery.update({
        where: { id: d.id },
        data: { ackReminderSentAt: asOf },
      });
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'AnnouncementDelivery',
        entityId: d.id,
        action: 'announcement_overdue',
        after: {
          announcementId: d.announcementId,
          companyId: d.announcement.companyId,
          title: d.announcement.title,
        },
      });
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'AnnouncementDelivery',
        entityId: d.id,
        action: 'announcement_reminder_sent',
        after: { kind: 'unacknowledged', announcementId: d.announcementId },
      });
    }

    await this.escalateOwnersForOverdue(asOf);
  }

  private async escalateOwnersForOverdue(asOf: Date): Promise<void> {
    const overdue = await this.prisma.announcementDelivery.findMany({
      where: {
        acknowledgedAt: null,
        ackReminderSentAt: { not: null, lte: asOf },
        announcement: { status: 'published', deletedAt: null, mustAcknowledge: true },
      },
      include: { announcement: { select: { id: true, companyId: true, title: true } } },
    });

    const byAnnouncement = new Map<string, { companyId: string; title: string; count: number }>();
    for (const row of overdue) {
      const key = row.announcementId;
      const existing = byAnnouncement.get(key);
      if (existing) {
        existing.count += 1;
      } else {
        const companyId = row.announcement.companyId;
        if (!companyId) continue;
        byAnnouncement.set(key, {
          companyId,
          title: row.announcement.title,
          count: 1,
        });
      }
    }

    for (const [, meta] of byAnnouncement) {
      await this.notifier.notifyOwnerOverdueEscalation(meta.companyId, meta.title, meta.count);
      await this.audit.record(SYSTEM_ACTOR, {
        entityType: 'Announcement',
        entityId: meta.companyId ?? 'unknown',
        action: 'announcement_overdue_owner_escalation',
        after: { title: meta.title, overdueCount: meta.count },
      });
    }
  }
}
