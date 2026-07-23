// ============================================================================
// Absence flagging scheduler — runs every minute; flags per employee after
// shift start + escalation window (no check-in).
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { BANGKOK_TZ } from '../../../shared/time/bangkok-time.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';
import { AbsenceFlagJob } from './absence-flag.job';

@Injectable()
export class AbsenceFlagScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AbsenceFlagScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 60_000;
  private static readonly LOCK_TTL_SEC = 55;

  constructor(
    private readonly prisma: PrismaService,
    private readonly flagJob: AbsenceFlagJob,
    private readonly lock: RedisLockService,
    private readonly dates: DateProvider,
    private readonly schedulerTimes: SchedulerTimeProvider,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.runTick()
        .catch((err) => this.logger.error('Absence flag tick failed', err));
    }, AbsenceFlagScheduler.INTERVAL_MS);
    setTimeout(() => {
      this.runTick().catch((err) => this.logger.error('Initial absence flag run failed', err));
    }, 15_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runTick(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const workDateIso = this.bangkokDateIso(ref);
    const minuteKey = this.schedulerTimes.minuteKey(ref);

    const companies = await this.prisma.company.findMany({
      where: { isActive: true, deletedAt: null },
      select: { id: true },
    });

    for (const company of companies) {
      const lockKey = `workhq:absence-flag:${company.id}:${minuteKey}`;
      const acquired = await this.lock.acquire(lockKey, AbsenceFlagScheduler.LOCK_TTL_SEC);
      if (!acquired) continue;

      try {
        const workDate = new Date(`${workDateIso}T00:00:00.000Z`);
        await this.flagJob.runForCompany(company.id, workDate, ref);
      } catch (err) {
        this.logger.error(`Absence flag failed company=${company.id}`, err);
      } finally {
        await this.lock.release(lockKey);
      }
    }
  }

  private bangkokDateIso(asOf: Date): string {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: BANGKOK_TZ,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(asOf);
  }
}
