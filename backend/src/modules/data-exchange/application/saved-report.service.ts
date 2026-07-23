// ============================================================================
// REPORT-001 — Saved reports
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ExportFormat, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { ExportService } from './export.service';

@Injectable()
export class SavedReportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly exports: ExportService,
  ) {}

  async list(actor: ActorContext, companyId: string, module?: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.savedReport.findMany({
      where: { companyId, ...(module ? { module } : {}) },
      orderBy: [{ isFavorite: 'desc' }, { name: 'asc' }],
    });
  }

  async create(actor: ActorContext, dto: {
    companyId: string;
    module: string;
    name: string;
    description?: string;
    templateId?: string;
    filters?: Record<string, unknown>;
    columns?: string[];
    defaultFormat?: ExportFormat;
    shareMode?: string;
  }) {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const row = await this.prisma.savedReport.create({
      data: {
        companyId: dto.companyId,
        module: dto.module,
        name: dto.name,
        description: dto.description,
        templateId: dto.templateId,
        filtersJson: dto.filters as Prisma.InputJsonValue,
        columnsJson: dto.columns as Prisma.InputJsonValue,
        defaultFormat: dto.defaultFormat ?? 'google_sheets',
        shareMode: (dto.shareMode ?? 'owner_secretary') as never,
        createdBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'SavedReport',
      entityId: row.id,
      action: 'saved_report_created',
    });
    return row;
  }

  async update(actor: ActorContext, id: string, data: Partial<{
    name: string;
    description: string;
    filters: Record<string, unknown>;
    columns: string[];
    defaultFormat: ExportFormat;
    isFavorite: boolean;
  }>) {
    const row = await this.get(actor, id);
    return this.prisma.savedReport.update({
      where: { id: row.id },
      data: {
        ...(data.name ? { name: data.name } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.filters ? { filtersJson: data.filters as Prisma.InputJsonValue } : {}),
        ...(data.columns ? { columnsJson: data.columns as Prisma.InputJsonValue } : {}),
        ...(data.defaultFormat ? { defaultFormat: data.defaultFormat } : {}),
        ...(data.isFavorite !== undefined ? { isFavorite: data.isFavorite } : {}),
      },
    });
  }

  async favorite(actor: ActorContext, id: string, isFavorite: boolean) {
    return this.update(actor, id, { isFavorite });
  }

  async run(actor: ActorContext, id: string) {
    const report = await this.get(actor, id);
    return this.exports.create(actor, {
      module: report.module,
      companyId: report.companyId!,
      format: report.defaultFormat,
      filters: report.filtersJson as Record<string, unknown>,
      columns: report.columnsJson as string[] | undefined,
      savedReportId: report.id,
      reportTemplateId: report.templateId ?? undefined,
    });
  }

  async get(actor: ActorContext, id: string) {
    const row = await this.prisma.savedReport.findUniqueOrThrow({ where: { id } });
    if (row.companyId) await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }
}
