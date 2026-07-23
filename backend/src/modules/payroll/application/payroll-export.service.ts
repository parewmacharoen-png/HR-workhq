// ============================================================================
// modules/payroll/application/payroll-export.service.ts
// PAY-006 — bank transfer export batches.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { PayrollCycleNotFoundError } from '../domain/errors/payroll.errors';
import {
  PayrollExportBatchCancelledError,
  PayrollExportBatchNotFoundError,
  PayrollExportExceptionsBlockedError,
  PayrollExportInvalidFormatError,
} from '../domain/errors/payroll-export.errors';
import { PayrollExportAccessService } from './payroll-export-access.service';
import {
  decimalFromNumber,
  PayrollExportValidatorService,
} from './payroll-export-validator.service';
import { PayrollExportSheetGenerator } from './payroll-export-sheet.generator';
import {
  CreatePayrollExportBatchDto,
  PayrollExportBatchResponse,
  PayrollExportItemResponse,
  PayrollExportPreviewResponse,
} from './dto/payroll-export.dto';
import { PayrollExportTelegramNotifier } from '../../telegram/application/payroll-export.notifier';
import { DateProvider } from '../../../shared/time/date.provider';

@Injectable()
export class PayrollExportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PayrollExportAccessService,
    private readonly validator: PayrollExportValidatorService,
    private readonly sheets: PayrollExportSheetGenerator,
    private readonly audit: AuditService,
    private readonly notifier: PayrollExportTelegramNotifier,
    private readonly dates: DateProvider,
  ) {}

  async preview(actor: ActorContext, cycleId: string): Promise<PayrollExportPreviewResponse> {
    const prepared = await this.validator.prepareForCycle(cycleId);
    await this.access.assertCanExport(actor, prepared.cycle.companyId);
    return this.validator.toPreview(prepared);
  }

  async createExport(
    actor: ActorContext,
    cycleId: string,
    dto: CreatePayrollExportBatchDto,
  ): Promise<PayrollExportBatchResponse> {
    const prepared = await this.validator.prepareForCycle(cycleId);
    await this.access.assertCanExport(actor, prepared.cycle.companyId);

    const exceptions = prepared.items.filter((row) => row.exportStatus === 'exception');
    if (exceptions.length > 0) {
      if (!dto.confirmExceptions) {
        throw new PayrollExportExceptionsBlockedError(
          exceptions.map((row) => ({
            employeeId: row.employeeId,
            employeeCode: row.employeeCode,
            employeeName: row.employeeName,
            exceptionFlags: row.exceptionFlags,
          })),
        );
      }
      await this.access.assertOwnerConfirmExceptions(actor, prepared.cycle.companyId);
    }

    if (dto.regenerateFromBatchId) {
      await this.cancelBatchInternal(actor, dto.regenerateFromBatchId, prepared.cycle.companyId, 'regenerated');
    }

    const now = this.dates.now();
    const ownerConfirmed = exceptions.length > 0 && dto.confirmExceptions === true;
    const batch = await this.prisma.payrollExportBatch.create({
      data: {
        payrollCycleId: prepared.cycle.id,
        companyId: prepared.cycle.companyId,
        exportedBy: actor.userId,
        exportedAt: now,
        status: 'completed',
        includedCount: prepared.includedCount,
        exceptionCount: prepared.exceptionCount,
        totalNetPayAmount: decimalFromNumber(prepared.totalNetPayAmount),
        ownerConfirmedExceptions: ownerConfirmed,
        ownerConfirmedBy: ownerConfirmed ? actor.userId : null,
        ownerConfirmedAt: ownerConfirmed ? now : null,
        regeneratedFromBatchId: dto.regenerateFromBatchId ?? null,
        items: {
          create: prepared.items.map((row) => ({
            employee: { connect: { id: row.employeeId } },
            employeeCode: row.employeeCode,
            employeeName: row.employeeName,
            department: row.department,
            teamName: row.teamName,
            bankName: row.bankName,
            bankAccountNo: row.bankAccountNo,
            bankAccountName: row.bankAccountName,
            netPayAmount: decimalFromNumber(row.netPayAmount),
            payrollComponents: row.payrollComponents as object,
            exportStatus: row.exportStatus,
            exceptionFlags: row.exceptionFlags as object,
          })),
        },
      },
      include: { items: { orderBy: [{ exportStatus: 'asc' }, { employeeCode: 'asc' }] } },
    });

    const response = this.toBatchResponse(
      batch as typeof batch & { items: NonNullable<typeof batch.items> },
      prepared.cycle,
    );
    await this.audit.record(actor, {
      entityType: 'payroll_export_batch',
      entityId: batch.id,
      action: dto.regenerateFromBatchId ? 'export_regenerated' : 'export_created',
      after: {
        payrollCycleId: batch.payrollCycleId,
        includedCount: batch.includedCount,
        exceptionCount: batch.exceptionCount,
        totalNetPayAmount: Number(batch.totalNetPayAmount),
      },
    });

    await this.notifier.notifyExportCreated({
      companyId: batch.companyId,
      batchId: batch.id,
      cycleId: batch.payrollCycleId,
      includedCount: batch.includedCount,
      exceptionCount: batch.exceptionCount,
      totalNetPayAmount: Number(batch.totalNetPayAmount),
    });

    return response;
  }

  async getBatch(actor: ActorContext, batchId: string): Promise<PayrollExportBatchResponse> {
    const batch = await this.loadBatchOrThrow(batchId);
    await this.access.assertCanDownload(actor, batch.companyId);
    const cycle = await this.prisma.payrollCycle.findUnique({ where: { id: batch.payrollCycleId } });
    if (!cycle) throw new PayrollCycleNotFoundError(batch.payrollCycleId);
    return this.toBatchResponse(batch, cycle);
  }

  async listBatchesForCycle(actor: ActorContext, cycleId: string): Promise<PayrollExportBatchResponse[]> {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, deletedAt: null },
    });
    if (!cycle) throw new PayrollCycleNotFoundError(cycleId);
    await this.access.assertCanDownload(actor, cycle.companyId);

    const batches = await this.prisma.payrollExportBatch.findMany({
      where: { payrollCycleId: cycleId },
      include: { items: { orderBy: [{ exportStatus: 'asc' }, { employeeCode: 'asc' }] } },
      orderBy: { exportedAt: 'desc' },
    });

    return batches.map((batch) => this.toBatchResponse(batch, cycle));
  }

  async downloadBatch(
    actor: ActorContext,
    batchId: string,
    format: string,
  ): Promise<{ buffer: Buffer; filename: string; contentType: string }> {
    if (format !== 'xlsx' && format !== 'csv') {
      throw new PayrollExportInvalidFormatError(format);
    }

    const batch = await this.loadBatchOrThrow(batchId);
    await this.access.assertCanDownload(actor, batch.companyId);
    if (batch.status === 'cancelled') {
      throw new PayrollExportBatchCancelledError();
    }

    const cycle = await this.prisma.payrollCycle.findUnique({ where: { id: batch.payrollCycleId } });
    if (!cycle) throw new PayrollCycleNotFoundError(batch.payrollCycleId);

    const response = this.toBatchResponse(batch, cycle);
    const company = await this.prisma.company.findUnique({
      where: { id: batch.companyId },
      select: { name: true },
    });

    const context = {
      batch: response,
      cyclePeriodStart: cycle.periodStart.toISOString().slice(0, 10),
      cyclePeriodEnd: cycle.periodEnd.toISOString().slice(0, 10),
      cyclePayDate: cycle.payDate.toISOString().slice(0, 10),
      companyName: company?.name ?? null,
    };

    const buffer = format === 'xlsx'
      ? await this.sheets.generateXlsx(context)
      : this.sheets.generateCsv(context);
    const filename = this.sheets.buildFilename(batch.id, format, response.exportedAt);
    const contentType = format === 'xlsx'
      ? 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      : 'text/csv; charset=utf-8';

    await this.audit.record(actor, {
      entityType: 'payroll_export_batch',
      entityId: batch.id,
      action: 'export_downloaded',
      after: { format },
    });

    return { buffer, filename, contentType };
  }

  async cancelBatch(actor: ActorContext, batchId: string): Promise<PayrollExportBatchResponse> {
    const batch = await this.loadBatchOrThrow(batchId);
    await this.access.assertCanExport(actor, batch.companyId);
    return this.cancelBatchInternal(actor, batchId, batch.companyId, 'export_cancelled');
  }

  private async cancelBatchInternal(
    actor: ActorContext,
    batchId: string,
    companyId: string,
    auditAction: 'export_cancelled' | 'regenerated',
  ): Promise<PayrollExportBatchResponse> {
    const existing = await this.loadBatchOrThrow(batchId);
    if (existing.companyId !== companyId) {
      throw new PayrollExportBatchNotFoundError(batchId);
    }
    if (existing.status === 'cancelled') {
      throw new PayrollExportBatchCancelledError();
    }

    const now = this.dates.now();
    const batch = await this.prisma.payrollExportBatch.update({
      where: { id: batchId },
      data: {
        status: 'cancelled',
        cancelledAt: now,
        cancelledBy: actor.userId,
      },
      include: { items: { orderBy: [{ exportStatus: 'asc' }, { employeeCode: 'asc' }] } },
    });

    const cycle = await this.prisma.payrollCycle.findUnique({ where: { id: batch.payrollCycleId } });
    if (!cycle) throw new PayrollCycleNotFoundError(batch.payrollCycleId);

    await this.audit.record(actor, {
      entityType: 'payroll_export_batch',
      entityId: batch.id,
      action: auditAction,
      before: { status: 'completed' },
      after: { status: 'cancelled' },
    });

    return this.toBatchResponse(batch, cycle);
  }

  private async loadBatchOrThrow(batchId: string) {
    const batch = await this.prisma.payrollExportBatch.findUnique({
      where: { id: batchId },
      include: { items: { orderBy: [{ exportStatus: 'asc' }, { employeeCode: 'asc' }] } },
    });
    if (!batch) throw new PayrollExportBatchNotFoundError(batchId);
    return batch;
  }

  private toBatchResponse(
    batch: {
      id: string;
      payrollCycleId: string;
      companyId: string;
      exportedBy: string;
      exportedAt: Date;
      status: 'completed' | 'cancelled';
      includedCount: number;
      exceptionCount: number;
      totalNetPayAmount: { toString(): string } | number;
      ownerConfirmedExceptions: boolean;
      ownerConfirmedBy: string | null;
      ownerConfirmedAt: Date | null;
      regeneratedFromBatchId: string | null;
      cancelledAt: Date | null;
      cancelledBy: string | null;
      items: Array<{
        id: string;
        employeeId: string;
        employeeCode: string;
        employeeName: string;
        department: string | null;
        teamName: string | null;
        bankName: string | null;
        bankAccountNo: string | null;
        bankAccountName: string | null;
        netPayAmount: { toString(): string } | number;
        payrollComponents: unknown;
        exportStatus: 'included' | 'exception' | 'excluded';
        exceptionFlags: unknown;
      }>;
    },
    cycle: { periodStart: Date; periodEnd: Date; payDate: Date; status: string },
  ): PayrollExportBatchResponse {
    return {
      id: batch.id,
      payrollCycleId: batch.payrollCycleId,
      companyId: batch.companyId,
      exportedBy: batch.exportedBy,
      exportedAt: batch.exportedAt.toISOString(),
      status: batch.status,
      includedCount: batch.includedCount,
      exceptionCount: batch.exceptionCount,
      totalNetPayAmount: Number(batch.totalNetPayAmount),
      ownerConfirmedExceptions: batch.ownerConfirmedExceptions,
      ownerConfirmedBy: batch.ownerConfirmedBy,
      ownerConfirmedAt: batch.ownerConfirmedAt?.toISOString() ?? null,
      regeneratedFromBatchId: batch.regeneratedFromBatchId,
      cancelledAt: batch.cancelledAt?.toISOString() ?? null,
      cancelledBy: batch.cancelledBy,
      items: batch.items.map((row): PayrollExportItemResponse => ({
        id: row.id,
        employeeId: row.employeeId,
        employeeCode: row.employeeCode,
        employeeName: row.employeeName,
        department: row.department,
        teamName: row.teamName,
        bankName: row.bankName,
        bankAccountNo: row.bankAccountNo,
        bankAccountName: row.bankAccountName,
        netPayAmount: Number(row.netPayAmount),
        payrollComponents: row.payrollComponents as PayrollExportItemResponse['payrollComponents'],
        exportStatus: row.exportStatus,
        exceptionFlags: (row.exceptionFlags ?? []) as PayrollExportItemResponse['exceptionFlags'],
      })),
    };
  }
}
