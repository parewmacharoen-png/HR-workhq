// ============================================================================
// common/monitoring/redis-health.service.ts
// Optional Redis connectivity probe for health checks.
// ============================================================================

import { Injectable, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { AppConfigService } from '../../config/app-config.service';

@Injectable()
export class RedisHealthService implements OnModuleDestroy {
  private client: Redis | null = null;

  constructor(private readonly config: AppConfigService) {}

  async ping(): Promise<'up' | 'down' | 'not_configured'> {
    const url = this.config.redisUrl;
    if (!url) return 'not_configured';

    try {
      const client = this.getClient(url);
      const result = await client.ping();
      return result === 'PONG' ? 'up' : 'down';
    } catch {
      return 'down';
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
