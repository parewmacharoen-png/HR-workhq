// ============================================================================
// UX-002 — System health endpoints
// ============================================================================

import { Controller, Get } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { Public } from '../../../../auth/decorators/public.decorator';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { TelegramHealthService } from '../../../../common/monitoring/telegram-health.service';

export type ServiceStatus = 'ok' | 'degraded' | 'down';

export type SystemHealthResponse = {
  status: ServiceStatus;
  services: {
    api: ServiceStatus;
    database: ServiceStatus;
    telegram: ServiceStatus;
    queue?: ServiceStatus;
  };
  checkedAt: string;
};

@Controller('system')
export class SystemController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly telegramHealth: TelegramHealthService,
  ) {}

  @Public()
  @SkipThrottle()
  @Get('health')
  health(): Promise<SystemHealthResponse> {
    return this.buildHealth();
  }

  @Public()
  @SkipThrottle()
  @Get('status')
  status(): Promise<SystemHealthResponse> {
    return this.buildHealth();
  }

  private async buildHealth(): Promise<SystemHealthResponse> {
    const [dbUp, telegram, queueBacklog] = await Promise.all([
      this.checkDatabase(),
      this.telegramHealth.check(),
      this.prisma.outboxEvent.count({ where: { processedAt: null } }).catch(() => 0),
    ]);

    const database: ServiceStatus = dbUp ? 'ok' : 'down';
    const telegramStatus: ServiceStatus =
      telegram.status === 'up' ? 'ok' : telegram.status === 'not_configured' ? 'degraded' : 'down';
    const queue: ServiceStatus = queueBacklog > 500 ? 'degraded' : 'ok';

    const services = {
      api: 'ok' as ServiceStatus,
      database,
      telegram: telegramStatus,
      queue,
    };

    const status: ServiceStatus =
      database === 'down' || telegramStatus === 'down'
        ? 'down'
        : telegramStatus === 'degraded' || queue === 'degraded'
          ? 'degraded'
          : 'ok';

    return {
      status,
      services,
      checkedAt: new Date().toISOString(),
    };
  }

  private async checkDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }
}
