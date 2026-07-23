// ============================================================================
// common/monitoring/redis-lock.service.ts
// Distributed lock via Redis SET NX EX. Used to ensure only one API replica
// runs scheduled jobs (e.g. Telegram brief broadcasts).
// ============================================================================

import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { randomUUID } from 'crypto';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class RedisLockService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisLockService.name);
  private readonly instanceId = randomUUID();
  private client: Redis | null = null;

  constructor(private readonly config: AppConfigService) {}

  /**
   * Acquire an exclusive lock. Returns true when this instance owns the lock.
   * When Redis is not configured, returns true (single-instance dev mode).
   */
  async acquire(key: string, ttlSeconds: number): Promise<boolean> {
    const url = this.config.redisUrl;
    if (!url) return true;

    try {
      const client = this.getClient(url);
      const result = await client.set(key, this.instanceId, 'EX', ttlSeconds, 'NX');
      return result === 'OK';
    } catch (err) {
      this.logger.warn(`Failed to acquire lock ${key}`, err);
      return false;
    }
  }

  /** Release lock only if owned by this instance. */
  async release(key: string): Promise<void> {
    const client = this.client;
    if (!client) return;

    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `;
    try {
      await client.eval(script, 1, key, this.instanceId);
    } catch (err) {
      this.logger.warn(`Failed to release lock ${key}`, err);
    }
  }

  onModuleDestroy(): void {
    if (this.client) {
      this.client.disconnect();
      this.client = null;
    }
  }

  private getClient(url: string): Redis {
    if (!this.client) {
      this.client = new Redis(url, {
        maxRetriesPerRequest: 1,
        connectTimeout: 3_000,
      });
    }
    return this.client;
  }
}
