// ============================================================================
// REPORT-001 — Report templates
// ============================================================================

import { Injectable, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { SYSTEM_REPORT_TEMPLATES } from '../domain/system-report-templates';
import { columnsForModule } from '../domain/column-catalog';

@Injectable()
export class ReportTemplateService implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedSystemTemplates().catch(() => undefined);
  }

  async list(actor: ActorContext, module?: string, companyId?: string) {
    if (companyId) await this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.reportTemplate.findMany({
      where: {
        status: 'active',
        ...(module ? { module } : {}),
        OR: [{ isSystem: true }, ...(companyId ? [{ companyId }] : [])],
      },
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
  }

  async create(actor: ActorContext, dto: {
    module: string;
    companyId?: string;
    name: string;
    description?: string;
    columns: string[];
    filters?: Record<string, unknown>;
    sort?: Record<string, unknown>;
    shareMode?: string;
  }) {
    if (dto.companyId) await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const row = await this.prisma.reportTemplate.create({
      data: {
        module: dto.module,
        companyId: dto.companyId,
        name: dto.name,
        description: dto.description,
        columnsJson: dto.columns as Prisma.InputJsonValue,
        filtersJson: dto.filters as Prisma.InputJsonValue,
        sortJson: dto.sort as Prisma.InputJsonValue,
        shareMode: (dto.shareMode ?? 'owner_secretary') as never,
        createdBy: actor.userId,
      },
    });
    await this.audit.record(actor, {
      entityType: 'ReportTemplate',
      entityId: row.id,
      action: 'report_template_created',
    });
    return row;
  }

  async archive(actor: ActorContext, id: string) {
    const row = await this.prisma.reportTemplate.findUniqueOrThrow({ where: { id } });
    if (row.isSystem) throw new Error('Cannot archive system template');
    if (row.companyId) await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return this.prisma.reportTemplate.update({
      where: { id },
      data: { status: 'archived' },
    });
  }

  async getColumnsForModule(module: string, actor: ActorContext, canViewSensitive: boolean) {
    void actor;
    const catalog = columnsForModule(module);
    return catalog.filter((c) => !c.sensitive || canViewSensitive);
  }

  private async seedSystemTemplates(): Promise<void> {
    for (const t of SYSTEM_REPORT_TEMPLATES) {
      const existing = await this.prisma.reportTemplate.findFirst({
        where: { module: t.module, name: t.name, isSystem: true },
      });
      if (existing) continue;
      await this.prisma.reportTemplate.create({
        data: {
          module: t.module,
          name: t.name,
          description: t.description,
          columnsJson: t.columns,
          isSystem: true,
          status: 'active',
        },
      });
    }
  }
}
