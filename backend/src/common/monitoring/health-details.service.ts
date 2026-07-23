// ============================================================================
// common/monitoring/health-details.service.ts
// Extended diagnostics for GET /health/details (ops / on-call).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service';
import { AppConfigService } from '../../config/app-config.service';
import { AiHealthService } from './ai-health.service';
import { RedisHealthService } from './redis-health.service';
import { TelegramHealthService } from './telegram-health.service';

const BOOT_TIME = Date.now();

@Injectable()
export class HealthDetailsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfigService,
    private readonly redisHealth: RedisHealthService,
    private readonly telegramHealth: TelegramHealthService,
    private readonly aiHealth: AiHealthService,
  ) {}

  async build() {
    const [
      dbOk,
      redis,
      telegram,
      ai,
      pendingWorkflows,
      outboxPending,
      outboxHighAttempts,
      auditLast24h,
      failedAiTools24h,
    ] = await Promise.all([
      this.pingDatabase(),
      this.redisHealth.ping(),
      this.telegramHealth.check(),
      this.aiHealth.check(),
      this.prisma.workflowInstance.count({ where: { status: 'pending', deletedAt: null } }),
      this.prisma.outboxEvent.count({ where: { processedAt: null } }),
      this.prisma.outboxEvent.count({ where: { processedAt: null, attempts: { gte: 3 } } }),
      this.auditCountSince(hoursAgo(24)),
      this.failedAiToolCountSince(hoursAgo(24)),
    ]);

    return {
      service: 'workhq-api',
      version: process.env.npm_package_version ?? '0.1.0',
      environment: this.config.nodeEnv,
      uptimeSeconds: Math.floor((Date.now() - BOOT_TIME) / 1000),
      nodeVersion: process.version,
      time: new Date().toISOString(),
      dependencies: {
        database: dbOk ? 'up' : 'down',
        redis,
        telegram: telegram.status,
        ai,
      },
      telegram: {
        webhookConfigured: telegram.webhookConfigured,
        botUsername: telegram.botUsername ?? null,
      },
      operations: {
        pendingWorkflows,
        outboxPending,
        outboxHighAttempts,
        outboxDegraded: outboxPending > 500,
      },
      audit: {
        eventsLast24h: auditLast24h,
        failedAiToolCallsLast24h: failedAiTools24h,
        aiToolCallsAudited: true,
        httpRequestsLogged: true,
        errorsReportedToSentry: !!this.config.sentryDsn,
      },
      config: {
        corsOrigins: this.config.corsOrigins,
        redisConfigured: !!this.config.redisUrl,
        sentryConfigured: !!this.config.sentryDsn,
        anthropicConfigured: !!this.config.anthropicApiKey,
        openaiConfigured: !!this.config.openAiApiKey,
        telegramConfigured: !!this.config.telegramBotToken,
      },
    };
  }

  private async pingDatabase(): Promise<boolean> {
    try {
      await this.prisma.$queryRawUnsafe('SELECT 1');
      return true;
    } catch {
      return false;
    }
  }

  private async auditCountSince(since: Date): Promise<number> {
    return this.prisma.auditLog.count({
      where: { occurredAt: { gte: since } },
    });
  }

  private async failedAiToolCountSince(since: Date): Promise<number> {
    return this.prisma.auditLog.count({
      where: {
        occurredAt: { gte: since },
        entityType: 'AiTool',
        action: 'tool_call_failed',
      },
    });
  }
}

function hoursAgo(h: number): Date {
  return new Date(Date.now() - h * 60 * 60 * 1000);
}
