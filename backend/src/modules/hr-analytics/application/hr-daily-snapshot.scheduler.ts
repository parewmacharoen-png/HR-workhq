// ============================================================================
// modules/hr-analytics/application/hr-daily-snapshot.scheduler.ts
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';
import { HrAnalyticsService } from './hr-analytics.service';

@Injectable()
export class HrDailySnapshotScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(HrDailySnapshotScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly RUN_AT = '23:30';

  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: HrAnalyticsService,
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
    const [h, m] = HrDailySnapshotScheduler.RUN_AT.split(':').map(Number) as [number, number];
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(h, m, now);
    this.timer = setTimeout(() => {
      this.runDaily()
        .catch((err) => this.logger.error('HR daily snapshot failed', err))
        .finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
  }

  async runDaily(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const dateKey = this.schedulerTimes.dateKey(ref);
    const lockKey = `workhq:hr-daily-snapshot:${dateKey}`;
    if (!(await this.lock.acquire(lockKey, 3600))) return;

    try {
      const companies = await this.prisma.company.findMany({
        where: { deletedAt: null, isActive: true },
        select: { id: true },
      });
      for (const c of companies) {
        await this.analytics.buildDailySnapshot(c.id, ref);
      }
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
