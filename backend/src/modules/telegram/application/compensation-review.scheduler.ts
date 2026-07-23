// ============================================================================
// modules/telegram/application/compensation-review.scheduler.ts
// SAL-001 — apply approved reviews on effective date.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { CompensationApplyService } from '../../salary-review/application/compensation-apply.service';
import { CompensationReviewTelegramNotifier } from './compensation-review.notifier';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { SalaryReviewService } from '../../salary-review/application/salary-review.service';
import { PromotionReviewService } from '../../salary-review/application/promotion-review.service';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';

@Injectable()
export class CompensationReviewScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(CompensationReviewScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly LOCK_TTL_SEC = 3_600;
  private static readonly RUN_AT = '06:30';

  constructor(
    private readonly applyService: CompensationApplyService,
    private readonly lock: RedisLockService,
    private readonly prisma: PrismaService,
    private readonly notifier: CompensationReviewTelegramNotifier,
    private readonly salaryReviews: SalaryReviewService,
    private readonly promotionReviews: PromotionReviewService,
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
    const [h, m] = CompensationReviewScheduler.RUN_AT.split(':').map(Number) as [number, number];
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(h, m, now);
    this.timer = setTimeout(() => {
      this.runDaily()
        .catch((err) => this.logger.error('Compensation review apply job failed', err))
        .finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
  }

  async runDaily(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const dateKey = this.schedulerTimes.dateKey(ref);
    const lockKey = `workhq:compensation-review-apply:${dateKey}`;
    const acquired = await this.lock.acquire(lockKey, CompensationReviewScheduler.LOCK_TTL_SEC);
    if (!acquired) return;

    try {
      const dueSalaries = await this.prisma.salaryReview.findMany({
        where: { status: 'approved', deletedAt: null, effectiveDate: { lte: ref } },
      });
      const duePromotions = await this.prisma.promotionReview.findMany({
        where: { status: 'approved', deletedAt: null, effectiveDate: { lte: ref } },
      });

      for (const review of dueSalaries) {
        await this.applyService.applySalaryReview(review.id);
        await this.notifier.notifySalaryApplied(await this.salaryReviews.toResponse(
          await this.prisma.salaryReview.findUniqueOrThrow({ where: { id: review.id } }),
        ));
      }

      for (const review of duePromotions) {
        await this.applyService.applyPromotionReview(review.id);
        await this.notifier.notifyPromotionApplied(await this.promotionReviews.toResponse(
          await this.prisma.promotionReview.findUniqueOrThrow({ where: { id: review.id } }),
        ));
      }
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
