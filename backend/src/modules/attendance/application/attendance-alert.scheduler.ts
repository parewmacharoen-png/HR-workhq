// ============================================================================
// modules/attendance/application/attendance-alert.scheduler.ts
// ATT-010 — Scheduled attendance alert engine (runs every minute).
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { AttendanceAlertService } from './attendance-alert.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';

@Injectable()
export class AttendanceAlertScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AttendanceAlertScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 60_000;
  private static readonly LOCK_TTL_SEC = 55;

  constructor(
    private readonly prisma: PrismaService,
    private readonly alertService: AttendanceAlertService,
    private readonly lock: RedisLockService,
    private readonly dates: DateProvider,
    private readonly schedulerTimes: SchedulerTimeProvider,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.runTick()
        .catch((err) => this.logger.error('Attendance alert tick failed', err));
    }, AttendanceAlertScheduler.INTERVAL_MS);
    // Run once shortly after startup
    setTimeout(() => {
      this.runTick().catch((err) => this.logger.error('Initial attendance alert run failed', err));
    }, 5_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runTick(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const minuteKey = this.schedulerTimes.minuteKey(ref);
    const lockKey = `workhq:attendance-alerts:${minuteKey}`;
    const acquired = await this.lock.acquire(lockKey, AttendanceAlertScheduler.LOCK_TTL_SEC);
    if (!acquired) return;

    try {
      const companies = await this.prisma.company.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true },
      });
      for (const company of companies) {
        await this.alertService.runForCompany(company.id, ref);
      }
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
