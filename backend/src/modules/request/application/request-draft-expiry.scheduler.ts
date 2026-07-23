// ============================================================================
// Hourly job — cancel stale request drafts and notify employees.
// ============================================================================

import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { RequestDraftExpiryService } from './request-draft-expiry.service';

@Injectable()
export class RequestDraftExpiryScheduler implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RequestDraftExpiryScheduler.name);
  private timer: NodeJS.Timeout | null = null;
  private static readonly INTERVAL_MS = 60 * 60_000;
  private static readonly LOCK_TTL_SEC = 3_500;

  constructor(
    private readonly expiry: RequestDraftExpiryService,
    private readonly lock: RedisLockService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.runTick().catch((err) => this.logger.error('Draft expiry tick failed', err));
    }, RequestDraftExpiryScheduler.INTERVAL_MS);
    setTimeout(() => {
      void this.runTick().catch((err) => this.logger.error('Initial draft expiry run failed', err));
    }, 15_000);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async runTick(): Promise<void> {
    const lockKey = 'workhq:request-draft-expiry';
    const acquired = await this.lock.acquire(lockKey, RequestDraftExpiryScheduler.LOCK_TTL_SEC);
    if (!acquired) return;
    try {
      await this.expiry.expireStaleDrafts();
    } finally {
      await this.lock.release(lockKey);
    }
  }
}
