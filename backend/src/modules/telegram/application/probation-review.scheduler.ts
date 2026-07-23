// ============================================================================
// modules/telegram/application/probation-review.scheduler.ts
// EMP-010 — daily probation review reminder job.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { daysUntilBangkok } from '../../employee/domain/services/employee-date-events.service';
import { ProbationReviewTelegramNotifier } from './probation-review.notifier';
import { PerformanceService } from '../../performance/application/performance.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';

@Injectable()
export class ProbationReviewScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ProbationReviewScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly LOCK_TTL_SEC = 3_600;
  private static readonly RUN_AT = '09:00';
  private static readonly REMINDER_DAYS = [7, 14, 30];

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: ProbationReviewTelegramNotifier,
    private readonly lock: RedisLockService,
    @Inject(forwardRef(() => PerformanceService))
    private readonly performance: PerformanceService,
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
    const [h, m] = ProbationReviewScheduler.RUN_AT.split(':').map(Number) as [number, number];
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(h, m, now);
    this.timer = setTimeout(() => {
      this.runDaily()
        .catch((err) => this.logger.error('Probation review job failed', err))
        .finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
  }

  async runDaily(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const dateKey = this.schedulerTimes.dateKey(ref);
    const lockKey = `workhq:probation-review:${dateKey}`;
    const acquired = await this.lock.acquire(lockKey, ProbationReviewScheduler.LOCK_TTL_SEC);
    if (!acquired) {
      this.logger.log(`Skipping probation review reminders — lock held (${lockKey})`);
      return;
    }

    try {
      const companies = await this.prisma.company.findMany({
        where: { isActive: true, deletedAt: null },
        select: { id: true, name: true },
      });

      for (const company of companies) {
        try {
          await this.processCompany(company.id, ref);
        } catch (err) {
          this.logger.error(`Probation reminders failed for ${company.name}`, err);
        }
      }
    } finally {
      await this.lock.release(lockKey);
    }
  }

  private async processCompany(companyId: string, asOf: Date): Promise<void> {
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: 'probation',
        probationEndDate: { not: null },
        assignments: {
          some: { companyId, effectiveTo: null, deletedAt: null },
        },
      },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        department: true,
        position: true,
        probationEndDate: true,
        hireDate: true,
      },
    });

    for (const employee of employees) {
      if (!employee.probationEndDate) continue;
      const daysRemaining = daysUntilBangkok(employee.probationEndDate, asOf);
      if (!ProbationReviewScheduler.REMINDER_DAYS.includes(daysRemaining)) continue;

      let reviewId = await this.performance.ensurePendingProbationReview(
        employee.id,
        companyId,
        employee.hireDate,
        employee.probationEndDate,
      );

      await this.notifier.notifyReminder(companyId, {
        companyId,
        employeeId: employee.id,
        employeeName: `${employee.firstName} ${employee.lastName}`,
        department: employee.department,
        position: employee.position,
        probationEndDate: employee.probationEndDate.toISOString().slice(0, 10),
        daysRemaining,
        reviewId,
      });
    }
  }
}
