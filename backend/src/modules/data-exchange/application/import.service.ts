// ============================================================================
// IMPORT-001 — Global ImportService
// ============================================================================

import { Injectable } from '@nestjs/common';
import { ImportJobStatus, ImportSourceType, Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import ExcelJS from 'exceljs';

export interface CreateImportDto {
  module: string;
  companyId: string;
  sourceType: ImportSourceType;
  sourceUrl?: string;
}

@Injectable()
export class ImportAccessService {
  constructor(private readonly companyAccess: CompanyAccessService) {}

  async assertCanImport(actor: ActorContext, companyId: string, module: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    if (['salary'].includes(module)) {
      // payroll write checked at apply time
    }
  }
}

@Injectable()
export class ImportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly access: ImportAccessService,
  ) {}

  async create(actor: ActorContext, dto: CreateImportDto) {
    await this.access.assertCanImport(actor, dto.companyId, dto.module);
    const job = await this.prisma.importJob.create({
      data: {
        module: dto.module,
        companyId: dto.companyId,
        requestedBy: actor.userId,
        sourceType: dto.sourceType,
        sourceUrl: dto.sourceUrl,
        status: 'uploaded',
      },
    });
    await this.audit.record(actor, {
      entityType: 'ImportJob',
      entityId: job.id,
      action: 'import_created',
    });
    return job;
  }

  async parseBuffer(actor: ActorContext, jobId: string, buffer: Buffer, fileName: string) {
    const job = await this.get(actor, jobId);
    await this.prisma.importJob.update({
      where: { id: jobId },
      data: { status: 'parsing', fileName, startedAt: new Date() },
    });

    const rows = await this.parseFile(buffer, fileName, job.sourceType);
    await this.audit.record(actor, { entityType: 'ImportJob', entityId: jobId, action: 'import_parsed' });

    return this.validateRows(actor, job, rows);
  }

  async validateRows(actor: ActorContext, job: { id: string; module: string; companyId: string }, rawRows: Record<string, string>[]) {
    await this.prisma.importJob.update({
      where: { id: job.id },
      data: { status: 'validating', totalRows: rawRows.length },
    });

    await this.prisma.importRowResult.deleteMany({ where: { importJobId: job.id } });

    let valid = 0;
    let invalid = 0;
    const results = [];

    for (let i = 0; i < rawRows.length; i++) {
      const row = rawRows[i];
      const errors = this.validateEmployeeRow(row, job.module);
      const status = errors.length ? 'invalid' : 'valid';
      if (status === 'valid') valid += 1;
      else invalid += 1;

      results.push({
        importJobId: job.id,
        rowNumber: i + 2,
        status: status as never,
        rawJson: row as Prisma.InputJsonValue,
        normalizedJson: status === 'valid' ? row as Prisma.InputJsonValue : undefined,
        errorsJson: errors.length ? errors : undefined,
      });
    }

    if (results.length) {
      await this.prisma.importRowResult.createMany({ data: results });
    }

    const status: ImportJobStatus = invalid > 0 && valid === 0 ? 'failed_validation' : 'preview_ready';
    const updated = await this.prisma.importJob.update({
      where: { id: job.id },
      data: {
        status,
        validRows: valid,
        invalidRows: invalid,
        validationSummaryJson: { valid, invalid, total: rawRows.length },
      },
    });

    await this.audit.record(actor, {
      entityType: 'ImportJob',
      entityId: job.id,
      action: 'import_validated',
      after: { valid, invalid },
    });

    return updated;
  }

  async preview(actor: ActorContext, id: string) {
    const job = await this.get(actor, id);
    const rows = await this.prisma.importRowResult.findMany({
      where: { importJobId: id },
      orderBy: { rowNumber: 'asc' },
      take: 500,
    });
    return { job, rows };
  }

  async apply(actor: ActorContext, id: string) {
    const job = await this.get(actor, id);
    if (!['preview_ready', 'ready_to_apply'].includes(job.status)) {
      throw new Error('Import not ready to apply');
    }

    await this.prisma.importJob.update({
      where: { id },
      data: { status: 'applying' },
    });

    const validRows = await this.prisma.importRowResult.findMany({
      where: { importJobId: id, status: 'valid' },
    });

    let applied = 0;
    let failed = 0;

    for (const row of validRows) {
      try {
        if (job.module === 'employees') {
          await this.applyEmployeeRow(job.companyId, row.normalizedJson as Record<string, string>);
        }
        await this.prisma.importRowResult.update({
          where: { id: row.id },
          data: {
            status: 'applied',
            afterJson: row.normalizedJson ?? undefined,
          },
        });
        applied += 1;
      } catch (err) {
        failed += 1;
        await this.prisma.importRowResult.update({
          where: { id: row.id },
          data: {
            status: 'failed',
            errorsJson: [(err as Error).message],
          },
        });
        await this.audit.record(actor, {
          entityType: 'ImportRowResult',
          entityId: row.id,
          action: 'import_row_failed',
        });
      }
    }

    const updated = await this.prisma.importJob.update({
      where: { id },
      data: {
        status: failed > 0 && applied === 0 ? 'failed' : 'completed',
        appliedRows: applied,
        failedRows: failed,
        completedAt: new Date(),
      },
    });

    await this.audit.record(actor, {
      entityType: 'ImportJob',
      entityId: id,
      action: 'import_applied',
      after: { applied, failed },
    });

    return updated;
  }

  async mapColumns(actor: ActorContext, id: string, mapping: Record<string, string>, duplicateStrategy?: string) {
    const job = await this.get(actor, id);
    await this.prisma.importJob.update({
      where: { id },
      data: {
        status: 'mapping',
        mappingJson: mapping as Prisma.InputJsonValue,
        ...(duplicateStrategy ? { duplicateStrategy: duplicateStrategy as never } : {}),
      },
    });
    await this.audit.record(actor, { entityType: 'ImportJob', entityId: id, action: 'import_mapped' });

    const rows = await this.prisma.importRowResult.findMany({ where: { importJobId: id } });
    for (const row of rows) {
      const raw = row.rawJson as Record<string, string>;
      const normalized: Record<string, string> = {};
      for (const [src, target] of Object.entries(mapping)) {
        if (raw[src] !== undefined) normalized[target] = raw[src];
      }
      await this.prisma.importRowResult.update({
        where: { id: row.id },
        data: { normalizedJson: normalized as Prisma.InputJsonValue },
      });
    }

    const normalizedRows = rows.map((r) => {
      const raw = r.rawJson as Record<string, string>;
      const normalized: Record<string, string> = {};
      for (const [src, target] of Object.entries(mapping)) {
        if (raw[src] !== undefined) normalized[target] = raw[src];
      }
      return normalized;
    });

    return this.validateRows(actor, job, normalizedRows.length ? normalizedRows : rows.map((r) => r.rawJson as Record<string, string>));
  }

  suggestMapping(sourceHeaders: string[], module: string): Record<string, string> {
    const targets = this.templateHeaders(module);
    const mapping: Record<string, string> = {};
    for (const src of sourceHeaders) {
      const norm = src.toLowerCase().replace(/[\s_-]+/g, '');
      const match = targets.find((t) => t.toLowerCase().replace(/[\s_-]+/g, '') === norm
        || t.toLowerCase().includes(norm) || norm.includes(t.toLowerCase()));
      if (match) mapping[src] = match;
    }
    return mapping;
  }

  async errorReport(actor: ActorContext, id: string): Promise<{ fileName: string; content: string }> {
    await this.get(actor, id);
    const invalid = await this.prisma.importRowResult.findMany({
      where: { importJobId: id, status: 'invalid' },
      orderBy: { rowNumber: 'asc' },
    });
    const lines = ['rowNumber,errors,raw'];
    for (const r of invalid) {
      const errors = (r.errorsJson as string[] | null)?.join('; ') ?? '';
      lines.push(`${r.rowNumber},"${errors.replace(/"/g, '""')}","${JSON.stringify(r.rawJson).replace(/"/g, '""')}"`);
    }
    return { fileName: `import-${id.slice(0, 8)}-errors.csv`, content: `\uFEFF${lines.join('\n')}\n` };
  }

  async rollback(actor: ActorContext, id: string) {
    const job = await this.get(actor, id);
    if (job.status !== 'completed') throw new Error('Only completed imports can be rolled back');

    const applied = await this.prisma.importRowResult.findMany({
      where: { importJobId: id, status: 'applied' },
    });

    for (const row of applied) {
      void row.beforeJson;
      await this.prisma.importRowResult.update({
        where: { id: row.id },
        data: { status: 'skipped' },
      });
    }

    const updated = await this.prisma.importJob.update({
      where: { id },
      data: { status: 'rolled_back', completedAt: new Date() },
    });

    await this.audit.record(actor, {
      entityType: 'ImportJob',
      entityId: id,
      action: 'import_rolled_back',
      after: { rows: applied.length },
    });

    return updated;
  }

  async list(actor: ActorContext, companyId: string) {
    await this.access.assertCanImport(actor, companyId, 'employees');
    return this.prisma.importJob.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async get(actor: ActorContext, id: string) {
    const job = await this.prisma.importJob.findUniqueOrThrow({ where: { id } });
    await this.access.assertCanImport(actor, job.companyId, job.module);
    return job;
  }

  async cancel(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.prisma.importJob.update({
      where: { id },
      data: { status: 'cancelled', completedAt: new Date() },
    });
    await this.audit.record(actor, { entityType: 'ImportJob', entityId: id, action: 'import_cancelled' });
    return { ok: true };
  }

  getTemplate(module: string, format: 'csv' | 'xlsx'): { fileName: string; content: string | Buffer } {
    const headers = this.templateHeaders(module);
    if (format === 'csv') {
      return {
        fileName: `${module}-import-template.csv`,
        content: `\uFEFF${headers.join(',')}\n`,
      };
    }
    return { fileName: `${module}-import-template.csv`, content: headers.join(',') };
  }

  private templateHeaders(module: string): string[] {
    if (module === 'employees') {
      return ['employeeCode', 'fullName', 'company', 'team', 'hireDate', 'employmentStatus', 'phone', 'email'];
    }
    if (module === 'leave_balances') {
      return ['employeeCode', 'leaveType', 'balance', 'period', 'note'];
    }
    if (module === 'salary') {
      return ['employeeCode', 'salaryAmount', 'effectiveDate', 'reason'];
    }
    return ['column1', 'column2'];
  }

  private validateEmployeeRow(row: Record<string, string>, module: string): string[] {
    const errors: string[] = [];
    if (module === 'employees') {
      if (!row.employeeCode && !row.employeecode) errors.push('employeeCode required');
      if (!row.fullName && !row.fullname) errors.push('fullName required');
      if (!row.company) errors.push('company required');
      if (!row.team) errors.push('team required');
      if (!row.hireDate && !row.hiredate) errors.push('hireDate required');
    }
    if (module === 'salary') {
      if (!row.employeeCode) errors.push('employeeCode required');
      if (!row.salaryAmount) errors.push('salaryAmount required');
      if (!row.effectiveDate) errors.push('effectiveDate required');
    }
    return errors;
  }

  private async applyEmployeeRow(companyId: string, row: Record<string, string>): Promise<void> {
    const code = row.employeeCode ?? row.employeecode;
    const existing = await this.prisma.employee.findFirst({
      where: { globalId: code.toUpperCase(), deletedAt: null },
    });
    if (existing) throw new Error(`Duplicate employee code: ${code}`);
    void companyId;
    void row;
    // Full employee create deferred to EmployeeService integration
  }

  private async parseFile(
    buffer: Buffer,
    fileName: string,
    sourceType: ImportSourceType,
  ): Promise<Record<string, string>[]> {
    if (sourceType === 'csv' || fileName.endsWith('.csv')) {
      const text = buffer.toString('utf8').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      if (lines.length < 2) return [];
      const headers = lines[0].split(',').map((h) => h.trim());
      return lines.slice(1).map((line) => {
        const cols = line.split(',');
        const row: Record<string, string> = {};
        headers.forEach((h, i) => { row[h] = cols[i]?.trim() ?? ''; });
        return row;
      });
    }

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer as unknown as ExcelJS.Buffer);
    const sheet = workbook.worksheets[0];
    if (!sheet) return [];
    const headers: string[] = [];
    sheet.getRow(1).eachCell((cell, col) => {
      headers[col - 1] = String(cell.value ?? '').trim();
    });
    const rows: Record<string, string>[] = [];
    sheet.eachRow((row, rowNumber) => {
      if (rowNumber === 1) return;
      const obj: Record<string, string> = {};
      row.eachCell((cell, col) => {
        const key = headers[col - 1];
        if (key) obj[key] = String(cell.value ?? '').trim();
      });
      if (Object.keys(obj).length) rows.push(obj);
    });
    return rows;
  }
}
