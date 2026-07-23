// ============================================================================
// modules/telegram/application/exit-case.scheduler.ts
// EMP-012 — daily reminder for pending exit checklist items.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { ExitCaseTelegramNotifier } from './exit-case.notifier';
import { OPEN_WORKFLOW_STATUSES } from '../../exit/domain/services/exit-lifecycle.mapper';
import type { ExitCaseType } from '../../exit/domain/services/exit-lifecycle.mapper';
import { DateProvider } from '../../../shared/time/date.provider';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';

@Injectable()
export class ExitCaseScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ExitCaseScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly LOCK_TTL_SEC = 3_600;
  private static readonly RUN_AT = '09:30';

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: ExitCaseTelegramNotifier,
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
    const [h, m] = ExitCaseScheduler.RUN_AT.split(':').map(Number) as [number, number];
    const now = this.dates.now();
    const next = this.schedulerTimes.nextBangkokRun(h, m, now);
    this.timer = setTimeout(() => {
      this.runDaily()
        .catch((err) => this.logger.error('Exit checklist reminder job failed', err))
        .finally(() => this.scheduleNext());
    }, next.getTime() - now.getTime());
  }

  async runDaily(asOf?: Date): Promise<void> {
    const ref = asOf ?? this.dates.now();
    const dateKey = this.schedulerTimes.dateKey(ref);
    const lockKey = `workhq:exit-checklist:${dateKey}`;
    const acquired = await this.lock.acquire(lockKey, ExitCaseScheduler.LOCK_TTL_SEC);
    if (!acquired) {
      this.logger.log(`Skipping exit checklist reminders — lock held (${lockKey})`);
      return;
    }

    try {
      const activeStatuses = OPEN_WORKFLOW_STATUSES.filter((s) => s !== 'draft');
      const cases = await this.prisma.employeeExitCase.findMany({
        where: {
          deletedAt: null,
          status: { in: activeStatuses },
        },
        include: {
          checklistItems: { where: { completed: false }, orderBy: { sortOrder: 'asc' } },
        },
      });

      for (const exitCase of cases) {
        if (exitCase.checklistItems.length === 0) continue;
        try {
          await this.notifier.notifyChecklistPending({
            companyId: exitCase.companyId,
            exitCaseId: exitCase.id,
            employeeId: exitCase.employeeId,
            exitType: exitCase.exitType as ExitCaseType,
            effectiveTerminationDate: exitCase.effectiveTerminationDate.toISOString().slice(0, 10),
            pendingItems: exitCase.checklistItems.map((i) => i.label),
          });
        } catch (err) {
          this.logger.warn(`Exit checklist reminder failed for ${exitCase.id}: ${String(err)}`);
        }
      }
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
