// ============================================================================
// EXPORT-004 — Async export queue
// ============================================================================

import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import type { ExportService } from './export.service';
import { EXPORT_SERVICE } from './export.service.token';
import { ActorContext } from '../../../shared/kernel/actor-context';

@Injectable()
export class ExportQueueService implements OnModuleInit {
  private readonly log = new Logger(ExportQueueService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    @Inject(EXPORT_SERVICE) private readonly exports: ExportService,
    private readonly lock: RedisLockService,
  ) {}

  onModuleInit(): void {
    void this.schedulePoll();
  }

  private schedulePoll(): void {
    this.timer = setTimeout(async () => {
      try {
        await this.processQueue();
      } catch (err) {
        this.log.error(`Export queue poll failed: ${(err as Error).message}`);
      } finally {
        this.schedulePoll();
      }
    }, 5_000);
  }

  async enqueue(jobId: string): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'queued', progressPercent: 0 },
    });
  }

  async cancel(jobId: string): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id: jobId, status: { in: ['pending', 'queued'] } },
      data: { status: 'cancelled', completedAt: new Date() },
    });
  }

  async updateProgress(jobId: string, percent: number): Promise<void> {
    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { progressPercent: Math.min(100, Math.max(0, percent)) },
    });
  }

  private async processQueue(): Promise<void> {
    const jobs = await this.prisma.exportJob.findMany({
      where: { status: 'queued' },
      orderBy: { createdAt: 'asc' },
      take: 5,
    });

    for (const job of jobs) {
      const lockKey = `workhq:export-job:${job.id}`;
      const acquired = await this.lock.acquire(lockKey, 300);
      if (!acquired) continue;

      const actor: ActorContext = {
        userId: job.requestedBy,
        companyId: job.companyId,
        impersonatorUserId: null,
      };

      try {
        await this.exports.runJob(actor, job.id);
      } catch (err) {
        this.log.error(`Queued export ${job.id} failed: ${(err as Error).message}`);
      } finally {
        await this.lock.release(lockKey);
      }
    }
  }
}
