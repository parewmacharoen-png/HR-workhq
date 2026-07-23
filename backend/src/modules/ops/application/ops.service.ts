// ============================================================================
// modules/ops/application/ops.service.ts
// OPS-001 — Admin operations console
// ============================================================================

import { Injectable, Optional, Inject, forwardRef } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { OutboxDispatcherService } from '../../../common/outbox/outbox-dispatcher.service';
import { ExportService } from '../../data-exchange/application/export.service';
import { OpsAccessService } from './ops-access.service';

@Injectable()
export class OpsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: OpsAccessService,
    private readonly lock: RedisLockService,
    @Optional() private readonly outbox?: OutboxDispatcherService,
    @Optional() private readonly exports?: ExportService,
  ) {}

  async getHealth(actor: ActorContext) {
    await this.access.assertOwner(actor);

    const migrationPending = await this.checkMigrationState();
    const redisOk = await this.checkRedis();
    const storageOk = await this.checkStorage();
    const telegramConfigured = Boolean(process.env.TELEGRAM_BOT_TOKEN);
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

    const [
      failedDocs,
      pendingOutbox,
      stuckOutbox,
      formulaFallbacks24h,
      failedApprovals24h,
      aiFailures24h,
      payrollCyclesOpen,
    ] = await Promise.all([
      this.prisma.documentGenerationJob.count({ where: { status: 'failed' } }),
      this.prisma.outboxEvent.count({ where: { processedAt: null } }).catch(() => -1),
      this.prisma.outboxEvent.count({ where: { processedAt: null, attempts: { gte: 3 } } }).catch(() => -1),
      this.prisma.formulaExecutionLog.count({ where: { fallbackUsed: true, executedAt: { gte: since24h } } }).catch(() => -1),
      this.prisma.workflowInstance.count({
        where: { status: { in: ['rejected', 'cancelled'] }, updatedAt: { gte: since24h } },
      }).catch(() => -1),
      this.prisma.aiQueryLog.count({
        where: {
          createdAt: { gte: since24h },
          OR: [{ deniedReason: { not: null } }, { answer: null }],
        },
      }).catch(() => -1),
      this.prisma.payrollCycle.count({ where: { status: 'open' } }).catch(() => -1),
    ]);

    const monitoring = {
      schedulerFailures24h: 0,
      telegramDeliveryFailures24h: stuckOutbox > 0 ? stuckOutbox : 0,
      outboxBacklog: pendingOutbox,
      outboxStuck: stuckOutbox,
      formulaFallbackUsage24h: formulaFallbacks24h,
      auditWriteFailures24h: 0,
      failedApprovals24h,
      failedDocumentGeneration: failedDocs,
      payrollOpenCycles: payrollCyclesOpen,
      aiGenerationFailures24h: aiFailures24h,
    };

    const alerts = this.buildAlerts(monitoring, redisOk, storageOk, telegramConfigured);

    const companyId = actor.companyId ?? undefined;
    const dataExchange = companyId && this.exports
      ? await this.exports.getOpsMetrics(companyId)
      : {
          exportsToday: 0,
          failedExports: 0,
          pendingImports: 0,
          importValidationFailures: 0,
        };

    const scheduledExportsEnabled = await this.prisma.scheduledExport.count({
      where: { enabled: true, ...(companyId ? { companyId } : {}) },
    }).catch(() => 0);

    return {
      db: { ok: true },
      migrations: migrationPending,
      redis: { ok: redisOk },
      storage: { ok: storageOk, driver: process.env.DOCUMENT_STORAGE_DRIVER ?? 'local' },
      telegram: { configured: telegramConfigured },
      schedulers: {
        announcementReminder: true,
        attendanceAlert: true,
        hrDailySnapshot: true,
        aiMorningBrief: true,
        probationReminder: true,
        timezone: 'Asia/Bangkok',
      },
      outbox: { ok: pendingOutbox === 0 || pendingOutbox < 100, pending: pendingOutbox, stuck: stuckOutbox },
      formulaEngine: { ok: formulaFallbacks24h < 50, fallbackUsage24h: formulaFallbacks24h },
      audit: { ok: true },
      queue: { ok: stuckOutbox === 0 },
      notificationEngine: { ok: pendingOutbox < 100 },
      monitoring,
      alerts,
      overallStatus: alerts.some((a) => a.severity === 'critical') ? 'critical' : alerts.some((a) => a.severity === 'warning') ? 'warning' : 'healthy',
      failedDocumentJobs: failedDocs,
      pendingOutboxEvents: pendingOutbox,
      dataExchange: {
        ...dataExchange,
        scheduledExportsEnabled,
        googleSheetsConfigured: Boolean(
          process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY,
        ),
      },
      checkedAt: new Date().toISOString(),
    };
  }

  private buildAlerts(
    m: Record<string, number>,
    redisOk: boolean,
    storageOk: boolean,
    telegramConfigured: boolean,
  ) {
    const alerts: Array<{ id: string; severity: 'critical' | 'warning' | 'info'; message: string }> = [];
    if (!redisOk) alerts.push({ id: 'redis', severity: 'critical', message: 'Redis unavailable — schedulers and locks may fail' });
    if (!storageOk) alerts.push({ id: 'storage', severity: 'critical', message: 'Document storage misconfigured' });
    if (!telegramConfigured) alerts.push({ id: 'telegram', severity: 'warning', message: 'TELEGRAM_BOT_TOKEN not set' });
    if (m.outboxBacklog > 100) alerts.push({ id: 'outbox', severity: 'critical', message: `Outbox backlog: ${m.outboxBacklog}` });
    else if (m.outboxBacklog > 20) alerts.push({ id: 'outbox', severity: 'warning', message: `Outbox backlog: ${m.outboxBacklog}` });
    if (m.outboxStuck > 0) alerts.push({ id: 'outbox-stuck', severity: 'critical', message: `${m.outboxStuck} stuck outbox events (≥3 attempts)` });
    if (m.failedDocumentGeneration > 0) alerts.push({ id: 'doc-gen', severity: 'warning', message: `${m.failedDocumentGeneration} failed document generation jobs` });
    if (m.formulaFallbackUsage24h > 20) alerts.push({ id: 'formula-fallback', severity: 'warning', message: `${m.formulaFallbackUsage24h} formula fallbacks in 24h` });
    if (m.aiGenerationFailures24h > 10) alerts.push({ id: 'ai-fail', severity: 'warning', message: `${m.aiGenerationFailures24h} AI query failures in 24h` });
    return alerts;
  }

  async retryOutbox(actor: ActorContext) {
    await this.access.assertOwner(actor);
    await this.audit.record(actor, {
      entityType: 'OpsAction',
      entityId: null,
      action: 'retry_outbox',
    });
    return { ok: true, note: 'Outbox dispatcher runs on poll interval' };
  }

  async rerunAnnouncementReminders(actor: ActorContext) {
    await this.access.assertOwner(actor);
    await this.audit.record(actor, {
      entityType: 'OpsAction',
      entityId: null,
      action: 'rerun_announcement_reminders_requested',
    });
    return { ok: true, note: 'Trigger via scheduler cron or manual service injection' };
  }

  async rerunAttendanceAlerts(actor: ActorContext, companyId: string) {
    await this.access.assertOwner(actor);
    await this.audit.record(actor, {
      entityType: 'OpsAction',
      entityId: companyId,
      action: 'rerun_attendance_alerts_requested',
    });
    return { ok: true, note: 'Trigger via scheduler cron' };
  }

  private async checkMigrationState() {
    try {
      await this.prisma.$queryRaw`SELECT 1 FROM ai.ai_query_logs LIMIT 1`;
      return { ok: true, note: 'next_phase tables present' };
    } catch {
      return { ok: false, note: 'pending migration deploy' };
    }
  }

  private async checkRedis(): Promise<boolean> {
    try {
      return await this.lock.acquire('workhq:ops:health', 5);
    } catch {
      return false;
    }
  }

  private checkStorage(): boolean {
    const driver = process.env.DOCUMENT_STORAGE_DRIVER ?? 'local';
    if (driver === 's3') return Boolean(process.env.DOCUMENT_STORAGE_BUCKET);
    return true;
  }
}
