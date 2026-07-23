// ============================================================================
// common/health.controller.ts
// Liveness/readiness probes and ops diagnostics.
// ============================================================================

import { Controller, Get, Header, Res, UseGuards } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Response } from 'express';
import { PrismaService } from '../shared/prisma/prisma.service';
import { Public } from '../auth/decorators/public.decorator';
import { RedisHealthService } from './monitoring/redis-health.service';
import { TelegramHealthService } from './monitoring/telegram-health.service';
import { AiHealthService } from './monitoring/ai-health.service';
import { HealthDetailsService } from './monitoring/health-details.service';
import { MetricsService } from './monitoring/metrics.service';
import { MetricsTokenGuard } from './monitoring/metrics-token.guard';

@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redisHealth: RedisHealthService,
    private readonly telegramHealth: TelegramHealthService,
    private readonly aiHealth: AiHealthService,
    private readonly healthDetails: HealthDetailsService,
    private readonly metrics: MetricsService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get()
  async health() {
    const [database, redis, telegram, ai, outboxBacklog] = await Promise.all([
      this.checkDatabase(),
      this.redisHealth.ping(),
      this.telegramHealth.check(),
      this.aiHealth.checkConfigured(),
      this.prisma.outboxEvent.count({ where: { processedAt: null } }),
    ]);

    const checks = {
      database,
      redis,
      telegram: telegram.status,
      ai,
      outboxBacklog,
    };

    const degraded = database === 'down'
      || redis === 'down'
      || telegram.status === 'down'
      || ai.anthropic === 'down'
      || ai.openai === 'down'
      || outboxBacklog > 500;

    return {
      status: degraded ? 'degraded' : 'ok',
      checks,
      telegram: {
        webhookConfigured: telegram.webhookConfigured,
        botUsername: telegram.botUsername ?? null,
      },
      time: new Date().toISOString(),
    };
  }

  @Public()
  @SkipThrottle()
  @UseGuards(MetricsTokenGuard)
  @Get('details')
  async details() {
    return this.healthDetails.build();
  }

  @Public()
  @SkipThrottle()
  @UseGuards(MetricsTokenGuard)
  @Get('metrics')
  @Header('Content-Type', 'text/plain')
  async prometheusMetrics(@Res() res: Response): Promise<void> {
    res.setHeader('Content-Type', this.metrics.contentType);
    res.send(await this.metrics.getMetrics());
  }

  private async checkDatabase(): Promise<'up' | 'down'> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return 'up';
    } catch {
      return 'down';
    }
  }
}
