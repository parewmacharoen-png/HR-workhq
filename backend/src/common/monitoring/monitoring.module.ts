// ============================================================================
// common/monitoring/monitoring.module.ts
// ============================================================================

import { Global, Module } from '@nestjs/common';
import { AppConfigModule } from '../../config/config.module';
import { AlertingService } from './alerting.service';
import { MetricsService } from './metrics.service';
import { RedisHealthService } from './redis-health.service';
import { RedisLockService } from './redis-lock.service';
import { StructuredLoggerService } from './structured-logger.service';
import { TelegramHealthService } from './telegram-health.service';
import { AiHealthService } from './ai-health.service';
import { HealthDetailsService } from './health-details.service';
import { MetricsTokenGuard } from './metrics-token.guard';

@Global()
@Module({
  imports: [AppConfigModule],
  providers: [
    StructuredLoggerService,
    AlertingService,
    MetricsService,
    RedisHealthService,
    RedisLockService,
    TelegramHealthService,
    AiHealthService,
    HealthDetailsService,
    MetricsTokenGuard,
  ],
  exports: [
    StructuredLoggerService,
    AlertingService,
    MetricsService,
    RedisHealthService,
    RedisLockService,
    TelegramHealthService,
    AiHealthService,
    HealthDetailsService,
    MetricsTokenGuard,
  ],
})
export class MonitoringModule {}
