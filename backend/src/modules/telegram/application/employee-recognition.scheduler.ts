// ============================================================================
// modules/telegram/application/employee-recognition.scheduler.ts
// Daily job for birthday & work anniversary Telegram notifications.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { EmployeeEventsService } from '../../employee/application/employee-events.service';
import { EmployeeRecognitionService } from '../../employee/application/employee-recognition.service';
import { EmployeeRecognitionNotifier } from './employee-recognition.notifier';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';

@Injectable()
export class EmployeeRecognitionScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EmployeeRecognitionScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly LOCK_TTL_SEC = 3_600;
  private static readonly RUN_AT = '08:00';

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: EmployeeEventsService,
    private readonly recognitions: EmployeeRecognitionService,
    private readonly notifier: EmployeeRecognitionNotifier,
    private readonly lock: RedisLockService,
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
    const [h, m] = EmployeeRecognitionScheduler.RUN_AT.split(':').map(Number) as [number, number];
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(h, m, now);
    this.timer = setTimeout(() => {
      this.runDaily()
        .catch((err) => this.logger.error('Employee recognition job failed', err))
        .finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
  }

  async runDaily(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const dateKey = this.schedulerTimes.dateKey(ref);
    const lockKey = `workhq:employee-recognition:${dateKey}`;
    const acquired = await this.lock.acquire(lockKey, EmployeeRecognitionScheduler.LOCK_TTL_SEC);
    if (!acquired) {
      this.logger.log(`Skipping employee recognition — lock held (${lockKey})`);
      return;
    }

    try {
      const companies = await this.prisma.company.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });

      for (const company of companies) {
        try {
          const birthdays = await this.events.getTodaysBirthdays(company.id, ref);
          for (const event of birthdays) {
            await this.notifier.notifyBirthday(company.id, event);
            await this.notifier.broadcastCompanyBirthdayAnnouncement(company.id, event.employee.id);
          }

          const anniversaries = await this.events.getTodaysAnniversaries(company.id, ref);
          for (const event of anniversaries) {
            await this.notifier.notifyAnniversary(company.id, event);
          }

          await this.recognitions.processServiceAwardMilestones(company.id, ref);
        } catch (err) {
          this.logger.error(`Employee recognition failed for ${company.name}`, err);
        }
      }
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
