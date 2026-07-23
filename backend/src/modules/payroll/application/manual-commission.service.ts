// ============================================================================
// modules/payroll/application/manual-commission.service.ts
// HR enters externally calculated commission amounts into open payroll cycles.
// ============================================================================

import { ConflictException, Inject, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PayrollCycleNotFoundError } from '../domain/errors/payroll.errors';
import { PAYROLL_CYCLE_REPOSITORY, PayrollCycleRepository } from '../domain/repositories/payroll.repository';
import {
  BulkManualCommissionDto,
  BulkManualCommissionResponse,
  BulkManualCommissionRowResult,
  CreateManualCommissionDto,
  ManualCommissionResponse,
  ManualCommissionType,
} from './dto/manual-commission.dto';

@Injectable()
export class ManualCommissionService {
  constructor(
    @Inject(PAYROLL_CYCLE_REPOSITORY) private readonly cycles: PayrollCycleRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
  ) {}

  async create(actor: ActorContext, dto: CreateManualCommissionDto): Promise<ManualCommissionResponse> {
    return this.createEntry(actor, dto);
  }

  async bulkImport(actor: ActorContext, dto: BulkManualCommissionDto): Promise<BulkManualCommissionResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const results: BulkManualCommissionRowResult[] = [];

    for (let i = 0; i < dto.rows.length; i++) {
      const row = dto.rows[i]!;
      try {
        const entry = await this.createEntry(actor, {
          employeeId: row.employeeId,
          companyId: dto.companyId,
          payrollCycleId: dto.payrollCycleId,
          amount: row.amount,
          commissionType: row.commissionType,
          description: row.description,
          reason: row.reason,
          idempotencyKey: row.idempotencyKey,
        });
        results.push({ rowIndex: i, success: true, entry });
      } catch (err: unknown) {
        results.push({
          rowIndex: i,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    return {
      payrollCycleId: dto.payrollCycleId,
      companyId: dto.companyId,
      results,
      successCount: results.filter((r) => r.success).length,
      failureCount: results.filter((r) => !r.success).length,
    };
  }

  private async createEntry(
    actor: ActorContext,
    dto: CreateManualCommissionDto,
  ): Promise<ManualCommissionResponse> {
    if (!dto.reason?.trim()) {
      throw new UnprocessableEntityException('reason is required');
    }
    if (dto.amount <= 0) {
      throw new UnprocessableEntityException('amount must be greater than zero');
    }

    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);

    const cycle = await this.cycles.findById(dto.payrollCycleId);
    if (!cycle) throw new PayrollCycleNotFoundError(dto.payrollCycleId);
    if (cycle.companyId !== dto.companyId) {
      throw new UnprocessableEntityException('payrollCycleId does not belong to companyId');
    }
    cycle.assertOpen();

    const employee = await this.prisma.employee.findFirst({
      where: {
        id: dto.employeeId,
        deletedAt: null,
        assignments: {
          some: {
            companyId: dto.companyId,
            deletedAt: null,
            effectiveTo: null,
          },
        },
      },
      select: { id: true },
    });
    if (!employee) {
      throw new NotFoundException('Employee not found or not assigned to company');
    }

    if (dto.idempotencyKey) {
      const existing = await this.prisma.manualCommissionEntry.findFirst({
        where: { idempotencyKey: dto.idempotencyKey, deletedAt: null },
        include: { payrollItem: true },
      });
      if (existing) {
        if (
          existing.employeeId !== dto.employeeId
          || existing.companyId !== dto.companyId
          || existing.payrollCycleId !== dto.payrollCycleId
        ) {
          throw new ConflictException('idempotencyKey already used with different payload');
        }
        return this.toResponse(existing);
      }
    }

    const noteParts = [
      `manual_commission:${dto.commissionType}`,
      dto.description?.trim(),
      `reason: ${dto.reason.trim()}`,
    ].filter(Boolean);

    const entryId = randomUUID();
    const payrollItemId = randomUUID();

    const created = await this.prisma.$transaction(async (tx) => {
      await tx.payrollItem.create({
        data: {
          id: payrollItemId,
          payrollCycleId: dto.payrollCycleId,
          employeeId: dto.employeeId,
          companyId: dto.companyId,
          itemType: 'commission',
          amount: new Prisma.Decimal(dto.amount),
          sourceRefType: 'manual_commission',
          sourceRefId: entryId,
          note: noteParts.join(' | '),
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });

      return tx.manualCommissionEntry.create({
        data: {
          id: entryId,
          employeeId: dto.employeeId,
          companyId: dto.companyId,
          payrollCycleId: dto.payrollCycleId,
          payrollItemId,
          amount: new Prisma.Decimal(dto.amount),
          commissionType: dto.commissionType,
          description: dto.description?.trim() ?? null,
          reason: dto.reason.trim(),
          sourceDocumentUrl: dto.sourceDocumentUrl ?? null,
          idempotencyKey: dto.idempotencyKey ?? null,
          createdBy: actor.userId,
        },
      });
    });

    await this.audit.record(actor, {
      entityType: 'ManualCommissionEntry',
      entityId: created.id,
      action: 'create',
      after: {
        employeeId: dto.employeeId,
        companyId: dto.companyId,
        payrollCycleId: dto.payrollCycleId,
        payrollItemId,
        amount: dto.amount,
        commissionType: dto.commissionType,
        reason: dto.reason.trim(),
      },
    });

    return this.toResponse(created);
  }

  private toResponse(row: {
    id: string;
    payrollItemId: string;
    employeeId: string;
    companyId: string;
    payrollCycleId: string;
    amount: Prisma.Decimal;
    commissionType: ManualCommissionType;
    description: string | null;
    reason: string;
    sourceDocumentUrl: string | null;
    createdAt: Date;
  }): ManualCommissionResponse {
    return {
      id: row.id,
      payrollItemId: row.payrollItemId,
      employeeId: row.employeeId,
      companyId: row.companyId,
      payrollCycleId: row.payrollCycleId,
      amount: Number(row.amount),
      commissionType: row.commissionType,
      description: row.description,
      reason: row.reason,
      sourceDocumentUrl: row.sourceDocumentUrl,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
