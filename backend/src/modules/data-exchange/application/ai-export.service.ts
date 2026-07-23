// ============================================================================
// AI-004 — AI assisted export parser
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { ExportAccessService } from './export-access.service';
import { ExportService } from './export.service';

interface ParsedExportIntent {
  module: string;
  filters: Record<string, unknown>;
  columns?: string[];
  format: 'google_sheets' | 'pdf' | 'csv' | 'xlsx';
  summary: string;
}

@Injectable()
export class AiExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly access: ExportAccessService,
    private readonly exports: ExportService,
  ) {}

  async parse(actor: ActorContext, companyId: string, prompt: string) {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const parsed = this.parsePrompt(prompt);

    await this.access.assertCanExport(actor, companyId, parsed.module);

    const row = await this.prisma.aiExportRequest.create({
      data: {
        requestedBy: actor.userId,
        companyId,
        prompt,
        parsedModule: parsed.module,
        parsedFiltersJson: parsed.filters as Prisma.InputJsonValue,
        parsedColumnsJson: parsed.columns as Prisma.InputJsonValue,
        status: 'parsed',
      },
    });

    await this.audit.record(actor, {
      entityType: 'AiExportRequest',
      entityId: row.id,
      action: 'ai_export_requested',
      after: { module: parsed.module },
    });

    return {
      id: row.id,
      ...parsed,
    };
  }

  async confirm(actor: ActorContext, id: string) {
    const req = await this.prisma.aiExportRequest.findUniqueOrThrow({ where: { id } });
    await this.companyAccess.assertCompanyAccess(actor, req.companyId);
    if (req.status !== 'parsed') throw new Error('AI export request not in parsed state');

    const job = await this.exports.create(actor, {
      module: req.parsedModule!,
      companyId: req.companyId,
      format: 'google_sheets',
      filters: req.parsedFiltersJson as Record<string, unknown>,
      columns: req.parsedColumnsJson as string[] | undefined,
    });

    await this.prisma.aiExportRequest.update({
      where: { id },
      data: { status: 'exported', exportJobId: job.id },
    });

    await this.audit.record(actor, {
      entityType: 'AiExportRequest',
      entityId: id,
      action: 'ai_export_confirmed',
      after: { exportJobId: job.id },
    });

    return job;
  }

  async cancel(actor: ActorContext, id: string) {
    const req = await this.prisma.aiExportRequest.findUniqueOrThrow({ where: { id } });
    await this.companyAccess.assertCompanyAccess(actor, req.companyId);
    await this.prisma.aiExportRequest.update({
      where: { id },
      data: { status: 'cancelled' },
    });
    return { ok: true };
  }

  parsePrompt(prompt: string): ParsedExportIntent {
    const lower = prompt.toLowerCase();
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    if (/payroll|เงินเดือน/.test(lower)) {
      return {
        module: 'payroll',
        filters: { period: 'this_month' },
        format: 'google_sheets',
        summary: 'Payroll summary this month',
      };
    }
    if (/ลาป่วย|sick leave/.test(lower)) {
      return {
        module: 'leave',
        filters: { leaveType: 'sick', fromDate: monthStart },
        format: 'google_sheets',
        summary: 'Sick leave this month',
      };
    }
    if (/telegram|เชื่อม telegram/.test(lower)) {
      return {
        module: 'employees',
        filters: { telegramLinked: false },
        columns: ['employeeCode', 'firstName', 'lastName', 'phone'],
        format: 'google_sheets',
        summary: 'Employees not linked to Telegram',
      };
    }
    if (/kpi.*70|ต่ำกว่า 70/.test(lower)) {
      return {
        module: 'kpi',
        filters: { maxScore: 70 },
        format: 'google_sheets',
        summary: 'KPI below 70',
      };
    }
    if (/attendance|เข้างาน|มาสาย/.test(lower)) {
      return {
        module: 'attendance',
        filters: { date: now.toISOString().slice(0, 10) },
        format: 'google_sheets',
        summary: 'Attendance today',
      };
    }
    if (/audit|audit log/.test(lower)) {
      return {
        module: 'audit_logs',
        filters: { fromDate: monthStart },
        format: 'google_sheets',
        summary: 'Audit log this month',
      };
    }

    return {
      module: 'employees',
      filters: {},
      format: 'google_sheets',
      summary: 'Employee export',
    };
  }
}
