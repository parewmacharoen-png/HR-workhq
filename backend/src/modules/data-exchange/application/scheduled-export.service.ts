// ============================================================================
// EXPORT-002 — Scheduled export automation
// ============================================================================

import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ExportFormat, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { SchedulerTimeProvider } from '../../../shared/time/scheduler-time.provider';
import { RedisLockService } from '../../../common/monitoring/redis-lock.service';
import { ExportService } from './export.service';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';

export interface CreateScheduledExportDto {
  companyId: string;
  module: string;
  format?: ExportFormat;
  scheduleCron: string;
  timezone?: string;
  filters?: Record<string, unknown>;
  recipientsJson?: unknown;
  shareMode?: string;
}

@Injectable()
export class ScheduledExportService implements OnModuleInit {
  private readonly log = new Logger(ScheduledExportService.name);
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly exports: ExportService,
    private readonly companyAccess: CompanyAccessService,
    private readonly schedulerTimes: SchedulerTimeProvider,
    private readonly lock: RedisLockService,
  ) {}

  onModuleInit(): void {
    void this.schedulePoll();
  }

  private schedulePoll(): void {
    this.timer = setTimeout(async () => {
      try {
        await this.pollDue();
      } catch (err) {
        this.log.error(`Scheduled export poll failed: ${(err as Error).message}`);
      } finally {
        this.schedulePoll();
      }
    }, 60_000);
  }

  async create(actor: ActorContext, dto: CreateScheduledExportDto) {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const row = await this.prisma.scheduledExport.create({
      data: {
        companyId: dto.companyId,
        module: dto.module,
        format: dto.format ?? 'google_sheets',
        scheduleCron: dto.scheduleCron,
        timezone: dto.timezone ?? 'Asia/Bangkok',
        filtersJson: dto.filters as Prisma.InputJsonValue,
        recipientsJson: dto.recipientsJson as Prisma.InputJsonValue,
        shareMode: (dto.shareMode ?? 'owner_secretary') as never,
        createdBy: actor.userId,
        nextRunAt: new Date(),
      },
    });
    await this.audit.record(actor, {
      entityType: 'ScheduledExport',
      entityId: row.id,
      action: 'scheduled_export_created',
    });
    return row;
  }

  async list(actor: ActorContext, companyId: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.scheduledExport.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async get(actor: ActorContext, id: string) {
    const row = await this.prisma.scheduledExport.findUniqueOrThrow({ where: { id } });
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  async update(actor: ActorContext, id: string, data: Partial<CreateScheduledExportDto>) {
    await this.get(actor, id);
    const updated = await this.prisma.scheduledExport.update({
      where: { id },
      data: {
        ...(data.module ? { module: data.module } : {}),
        ...(data.scheduleCron ? { scheduleCron: data.scheduleCron } : {}),
        ...(data.filters ? { filtersJson: data.filters as Prisma.InputJsonValue } : {}),
      },
    });
    await this.audit.record(actor, {
      entityType: 'ScheduledExport',
      entityId: id,
      action: 'scheduled_export_updated',
    });
    return updated;
  }

  async enable(actor: ActorContext, id: string) {
    await this.get(actor, id);
    const row = await this.prisma.scheduledExport.update({
      where: { id },
      data: { enabled: true },
    });
    await this.audit.record(actor, { entityType: 'ScheduledExport', entityId: id, action: 'scheduled_export_enabled' });
    return row;
  }

  async disable(actor: ActorContext, id: string) {
    await this.get(actor, id);
    const row = await this.prisma.scheduledExport.update({
      where: { id },
      data: { enabled: false },
    });
    await this.audit.record(actor, { entityType: 'ScheduledExport', entityId: id, action: 'scheduled_export_disabled' });
    return row;
  }

  async runNow(actor: ActorContext, id: string) {
    const row = await this.get(actor, id);
    await this.audit.record(actor, { entityType: 'ScheduledExport', entityId: id, action: 'scheduled_export_run' });
    return this.executeScheduled(row, actor);
  }

  async delete(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.prisma.scheduledExport.delete({ where: { id } });
    return { ok: true };
  }

  private async pollDue(): Promise<void> {
    const now = new Date();
    const due = await this.prisma.scheduledExport.findMany({
      where: {
        enabled: true,
        OR: [{ nextRunAt: null }, { nextRunAt: { lte: now } }],
      },
      take: 20,
    });

    for (const row of due) {
      const lockKey = `workhq:scheduled-export:${row.id}`;
      const acquired = await this.lock.acquire(lockKey, 120);
      if (!acquired) continue;

      try {
        const actor: ActorContext = {
          userId: row.createdBy,
          companyId: row.companyId,
          impersonatorUserId: null,
        };
        await this.executeScheduled(row, actor);
      } finally {
        await this.lock.release(lockKey);
      }
    }
  }

  private async executeScheduled(
    row: { id: string; companyId: string; module: string; format: ExportFormat; filtersJson: unknown; shareMode: string; scheduleCron: string },
    actor: ActorContext,
  ) {
    try {
      const job = await this.exports.create(actor, {
        module: row.module,
        companyId: row.companyId,
        format: row.format,
        shareMode: row.shareMode,
        filters: row.filtersJson as Record<string, unknown>,
      });

      await this.prisma.scheduledExport.update({
        where: { id: row.id },
        data: {
          lastRunAt: new Date(),
          nextRunAt: this.schedulerTimes.nextBangkokRun(8, 0),
        },
      });

      return job;
    } catch (err) {
      await this.audit.record(actor, {
        entityType: 'ScheduledExport',
        entityId: row.id,
        action: 'scheduled_export_failed',
        after: { error: (err as Error).message },
      });
      throw err;
    }
  }
}
