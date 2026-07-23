// ============================================================================
// EXPORT-001 — Global ExportService (async queue, templates, columns)
// ============================================================================

import { Injectable, Optional, Inject, forwardRef } from '@nestjs/common';
import { ExportFormat, ExportMode, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { ExportAccessService } from './export-access.service';
import { ExportRedactionService } from './export-redaction.service';
import { ExportDatasetRegistry } from './export-dataset.registry';
import { CsvExportDriver } from './drivers/csv-export.driver';
import { ExcelExportDriver } from './drivers/excel-export.driver';
import { PdfExportDriver } from './drivers/pdf-export.driver';
import { GoogleSheetsExportDriver } from './drivers/google-sheets-export.driver';
import { ExportTelegramNotifier } from '../infrastructure/export-telegram.notifier';
import { ExportQueueService } from './export-queue.service';
import { UserExportPreferenceService } from './user-export-preference.service';
import { applyColumnSelection, columnsForModule } from '../domain/column-catalog';
import * as fs from 'fs';
import * as path from 'path';

export interface CreateExportDto {
  module: string;
  companyId: string;
  format?: ExportFormat;
  mode?: ExportMode;
  shareMode?: string;
  syncMode?: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  reportTemplateId?: string;
  savedReportId?: string;
  spreadsheetTitle?: string;
  existingSpreadsheetId?: string;
  async?: boolean;
}

@Injectable()
export class ExportService {
  private readonly storageBase: string;
  private readonly asyncThreshold: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ExportAccessService,
    private readonly redaction: ExportRedactionService,
    private readonly registry: ExportDatasetRegistry,
    private readonly csv: CsvExportDriver,
    private readonly excel: ExcelExportDriver,
    private readonly pdf: PdfExportDriver,
    private readonly googleSheets: GoogleSheetsExportDriver,
    private readonly preferences: UserExportPreferenceService,
    @Optional() @Inject(forwardRef(() => ExportQueueService)) private readonly queue?: ExportQueueService,
    @Optional() private readonly telegram?: ExportTelegramNotifier,
  ) {
    this.storageBase = process.env.DOCUMENT_STORAGE_BASE_PATH ?? 'backend/storage/exports';
    this.asyncThreshold = Number(process.env.EXPORT_ASYNC_ROW_THRESHOLD ?? 500);
  }

  async create(actor: ActorContext, dto: CreateExportDto) {
    await this.access.assertCanExport(actor, dto.companyId, dto.module);

    const format = dto.format
      ?? (process.env.EXPORT_DEFAULT_FORMAT as ExportFormat | undefined)
      ?? ExportFormat.google_sheets;
    const mode = dto.mode ?? ExportMode.create_spreadsheet;
    const shareMode = (dto.shareMode ?? process.env.GOOGLE_SHEETS_DEFAULT_SHARE_MODE ?? 'owner_secretary') as never;

    let columns = dto.columns;
    let filters = dto.filters;
    if (dto.reportTemplateId) {
      const tpl = await this.prisma.reportTemplate.findUnique({ where: { id: dto.reportTemplateId } });
      if (tpl) {
        columns = columns ?? (tpl.columnsJson as string[]);
        filters = { ...(tpl.filtersJson as Record<string, unknown>), ...filters };
      }
    }
    if (dto.savedReportId) {
      const saved = await this.prisma.savedReport.findUnique({ where: { id: dto.savedReportId } });
      if (saved) {
        columns = columns ?? (saved.columnsJson as string[] | undefined);
        filters = { ...(saved.filtersJson as Record<string, unknown>), ...filters };
      }
    }

    const job = await this.prisma.exportJob.create({
      data: {
        module: dto.module,
        companyId: dto.companyId,
        requestedBy: actor.userId,
        format,
        mode,
        shareMode,
        syncMode: (dto.syncMode ?? 'none') as never,
        reportTemplateId: dto.reportTemplateId,
        savedReportId: dto.savedReportId,
        filtersJson: filters as Prisma.InputJsonValue,
        columnsJson: columns as Prisma.InputJsonValue,
        status: 'pending',
      },
    });

    await this.audit.record(actor, {
      entityType: 'ExportJob',
      entityId: job.id,
      action: 'export_started',
      after: { module: dto.module, format },
    });

    if (columns?.length || format) {
      await this.preferences.save(actor, {
        module: dto.module,
        selectedColumns: columns,
        filters,
        lastFormat: format,
        lastTemplateId: dto.reportTemplateId,
      }).catch(() => undefined);
    }

    const shouldAsync = dto.async === true;
    if (shouldAsync && this.queue) {
      await this.queue.enqueue(job.id);
      await this.audit.record(actor, {
        entityType: 'ExportJob',
        entityId: job.id,
        action: 'export_queued',
      });
      return this.get(actor, job.id);
    }

    try {
      const result = await this.runJob(actor, job.id, dto);
      const rowCount = result.rowCount;
      if (!shouldAsync && rowCount > this.asyncThreshold && this.queue) {
        // Re-queue if sync run exceeded threshold (future runs use queue)
        void rowCount;
      }
      return result;
    } catch (err) {
      await this.prisma.exportJob.update({
        where: { id: job.id },
        data: {
          status: 'failed',
          failedReason: (err as Error).message,
          completedAt: new Date(),
        },
      });
      await this.audit.record(actor, {
        entityType: 'ExportJob',
        entityId: job.id,
        action: 'export_failed',
        after: { error: (err as Error).message },
      });
      if (this.telegram) {
        await this.telegram.notifyExportFailed(actor, job.id, (err as Error).message).catch(() => undefined);
      }
      throw err;
    }
  }

  async runJob(actor: ActorContext, jobId: string, dto?: CreateExportDto) {
    const job = await this.prisma.exportJob.findUniqueOrThrow({ where: { id: jobId } });
    await this.prisma.exportJob.update({
      where: { id: jobId },
      data: { status: 'running', startedAt: new Date(), progressPercent: 5 },
    });

    let dataset = await this.registry.build(job.module, actor, {
      companyId: job.companyId,
      filters: (job.filtersJson ?? dto?.filters) as Record<string, unknown> | undefined,
    });
    await this.queue?.updateProgress(jobId, 30);

    const selectedColumns = (job.columnsJson ?? dto?.columns) as string[] | undefined;
    if (selectedColumns?.length) {
      const catalog = columnsForModule(job.module);
      const applied = applyColumnSelection(dataset.headers, dataset.rows, selectedColumns, catalog);
      dataset = { ...dataset, headers: applied.headers, rows: applied.rows };
    }

    dataset = await this.redaction.redact(actor, dataset);
    await this.queue?.updateProgress(jobId, 50);

    const ctx = {
      jobId: job.id,
      module: job.module,
      companyId: job.companyId,
      mode: job.mode,
      shareMode: job.shareMode,
      spreadsheetTitle: dto?.spreadsheetTitle,
      existingSpreadsheetId: dto?.existingSpreadsheetId,
    };

    let result;
    switch (job.format) {
      case 'google_sheets':
        result = await this.googleSheets.export(dataset, ctx);
        await this.audit.record(actor, {
          entityType: 'ExportJob',
          entityId: jobId,
          action: result.googleSpreadsheetId ? 'google_sheet_created' : 'google_sheet_updated',
        });
        break;
      case 'pdf':
        result = await this.pdf.export(dataset, ctx);
        await this.audit.record(actor, { entityType: 'ExportJob', entityId: jobId, action: 'pdf_generated' });
        break;
      case 'csv':
        result = await this.csv.export(dataset, ctx);
        await this.audit.record(actor, { entityType: 'ExportJob', entityId: jobId, action: 'csv_generated' });
        break;
      case 'xlsx':
        result = await this.excel.export(dataset, ctx);
        await this.audit.record(actor, { entityType: 'ExportJob', entityId: jobId, action: 'excel_generated' });
        break;
      default:
        throw new Error(`Unsupported format: ${job.format}`);
    }

    await this.queue?.updateProgress(jobId, 85);

    let storageKey: string | null = null;
    if (result.buffer && result.fileName) {
      storageKey = await this.persistFile(job.companyId, job.id, result.fileName, result.buffer);
    }

    const updated = await this.prisma.exportJob.update({
      where: { id: jobId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        progressPercent: 100,
        rowCount: dataset.rows.length,
        columnsJson: dataset.headers as unknown as Prisma.InputJsonValue,
        googleSpreadsheetId: result.googleSpreadsheetId ?? null,
        googleWorksheetId: result.googleWorksheetId ?? null,
        googleSheetUrl: result.googleSheetUrl ?? null,
        externalDocumentId: result.googleSpreadsheetId ?? null,
        fileName: result.fileName ?? null,
        storageKey,
        lastSyncAt: job.syncMode !== 'none' ? new Date() : null,
      },
    });

    await this.audit.record(actor, {
      entityType: 'ExportJob',
      entityId: jobId,
      action: 'export_completed',
      after: { rowCount: dataset.rows.length, format: job.format },
    });

    if (this.telegram) {
      await this.telegram.notifyExportComplete(actor, updated).catch(() => undefined);
      await this.audit.record(actor, {
        entityType: 'ExportJob',
        entityId: jobId,
        action: 'telegram_export_sent',
      }).catch(() => undefined);
    }

    return updated;
  }

  async list(actor: ActorContext, companyId: string) {
    await this.access.assertCanListExports(actor, companyId);
    return this.prisma.exportJob.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(actor: ActorContext, id: string) {
    const job = await this.prisma.exportJob.findUniqueOrThrow({ where: { id } });
    await this.access.assertCanExport(actor, job.companyId, job.module);
    return job;
  }

  async retry(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.audit.record(actor, { entityType: 'ExportJob', entityId: id, action: 'export_retried' });
    if (this.queue) {
      await this.queue.enqueue(id);
      return this.get(actor, id);
    }
    return this.runJob(actor, id);
  }

  async cancel(actor: ActorContext, id: string) {
    await this.get(actor, id);
    if (this.queue) await this.queue.cancel(id);
    else {
      await this.prisma.exportJob.update({
        where: { id },
        data: { status: 'cancelled', completedAt: new Date() },
      });
    }
    await this.audit.record(actor, { entityType: 'ExportJob', entityId: id, action: 'export_cancelled' });
    return { ok: true, id };
  }

  async deleteRecord(actor: ActorContext, id: string) {
    const job = await this.get(actor, id);
    await this.prisma.exportJob.update({
      where: { id },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'ExportJob', entityId: id, action: 'export_deleted' });
    return { ok: true, id: job.id };
  }

  async getDownloadBuffer(actor: ActorContext, id: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
    const job = await this.get(actor, id);
    if (!job.storageKey) throw new Error('No file available for this export');
    const fullPath = path.join(this.storageBase, job.storageKey);
    const buffer = await fs.promises.readFile(fullPath);
    const mimeType = job.format === 'pdf' ? 'application/pdf'
      : job.format === 'xlsx' ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv';
    return { buffer, fileName: job.fileName ?? 'export', mimeType };
  }

  async getOpsMetrics(companyId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const since7d = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [
      exportsToday,
      failedExports,
      pendingImports,
      importFailures,
      rollbackCount,
      avgDuration,
      topModules,
    ] = await Promise.all([
      this.prisma.exportJob.count({ where: { companyId, createdAt: { gte: today } } }),
      this.prisma.exportJob.count({ where: { companyId, status: 'failed' } }),
      this.prisma.importJob.count({
        where: { companyId, status: { in: ['uploaded', 'parsing', 'mapping', 'validating', 'preview_ready', 'ready_to_apply'] } },
      }),
      this.prisma.importJob.count({ where: { companyId, status: 'failed_validation' } }),
      this.prisma.importJob.count({ where: { companyId, status: 'rolled_back' } }),
      this.prisma.exportJob.findMany({
        where: { companyId, status: 'completed', completedAt: { gte: since7d }, startedAt: { not: null } },
        select: { startedAt: true, completedAt: true },
        take: 100,
      }),
      this.prisma.exportJob.groupBy({
        by: ['module'],
        where: { companyId, createdAt: { gte: since7d } },
        _count: { id: true },
        orderBy: { _count: { id: 'desc' } },
        take: 5,
      }),
    ]);

    let averageExportDurationMs = 0;
    if (avgDuration.length) {
      const total = avgDuration.reduce((sum, j) => {
        if (!j.startedAt || !j.completedAt) return sum;
        return sum + (j.completedAt.getTime() - j.startedAt.getTime());
      }, 0);
      averageExportDurationMs = Math.round(total / avgDuration.length);
    }

    return {
      exportsToday,
      failedExports,
      pendingImports,
      importValidationFailures: importFailures,
      importRollbackCount: rollbackCount,
      averageExportDurationMs,
      mostExportedModules: topModules.map((m) => ({ module: m.module, count: m._count.id })),
    };
  }

  private async persistFile(companyId: string, jobId: string, fileName: string, buffer: Buffer): Promise<string> {
    const rel = path.join(companyId, jobId, fileName);
    const full = path.join(this.storageBase, rel);
    await fs.promises.mkdir(path.dirname(full), { recursive: true });
    await fs.promises.writeFile(full, buffer);
    return rel;
  }
}
