// ============================================================================
// Manual payroll item definitions — create schedules and apply to cycles
// ============================================================================

import {
  BadRequestException, Inject, Injectable, NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { PayrollCycleNotFoundError } from '../domain/errors/payroll.errors';
import {
  extractManualPayrollDefinitionId,
  getManualPayrollCategoryMeta,
  isDefinitionEffectiveForPeriod,
  manualPayrollItemNote,
  signedAmountForCategory,
  type ManualPayrollItemCategory,
} from '../domain/manual-payroll-item.constants';
import {
  PAYROLL_CYCLE_REPOSITORY,
  PAYROLL_ITEM_REPOSITORY,
  PayrollCycleRepository,
  PayrollItemRepository,
} from '../domain/repositories/payroll.repository';
import {
  ApplyManualPayrollItemsResult,
  CreateManualPayrollItemDto,
  ManualPayrollItemDefinitionResponse,
} from './dto/manual-payroll-item.dto';

@Injectable()
export class ManualPayrollItemService {
  constructor(
    @Inject(PAYROLL_CYCLE_REPOSITORY) private readonly cycles: PayrollCycleRepository,
    @Inject(PAYROLL_ITEM_REPOSITORY) private readonly items: PayrollItemRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async create(
    actor: ActorContext,
    dto: CreateManualPayrollItemDto,
  ): Promise<ManualPayrollItemDefinitionResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    await this.employeeAccess.assertEmployeeInCompany(dto.employeeId, dto.companyId);

    if (dto.effectiveUntil && dto.effectiveUntil < dto.effectiveFrom) {
      throw new BadRequestException('effectiveUntil must be on or after effectiveFrom');
    }

    const row = await this.prisma.manualPayrollItemDefinition.create({
      data: {
        companyId: dto.companyId,
        employeeId: dto.employeeId,
        category: dto.category,
        amount: new Prisma.Decimal(dto.amount),
        scheduleType: dto.scheduleType,
        effectiveFrom: new Date(dto.effectiveFrom),
        effectiveUntil: dto.effectiveUntil ? new Date(dto.effectiveUntil) : null,
        note: dto.note?.trim() || null,
        status: 'active',
        createdBy: actor.userId,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'ManualPayrollItemDefinition',
      entityId: row.id,
      action: 'create',
      after: {
        employeeId: dto.employeeId,
        category: dto.category,
        scheduleType: dto.scheduleType,
        amount: dto.amount,
      },
    });

    if (dto.applyToCycleId) {
      await this.applyDefinitionToCycle(actor, row.id, dto.applyToCycleId);
    }

    return this.toResponse(row);
  }

  async list(
    actor: ActorContext,
    companyId: string,
    employeeId?: string,
  ): Promise<ManualPayrollItemDefinitionResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.manualPayrollItemDefinition.findMany({
      where: {
        companyId,
        deletedAt: null,
        status: 'active',
        ...(employeeId ? { employeeId } : {}),
      },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    return rows.map((row: {
      id: string;
      companyId: string;
      employeeId: string;
      category: ManualPayrollItemCategory;
      amount: Prisma.Decimal;
      scheduleType: string;
      effectiveFrom: Date;
      effectiveUntil: Date | null;
      note: string | null;
      status: string;
    }) => this.toResponse(row));
  }

  async cancel(actor: ActorContext, id: string): Promise<void> {
    const row = await this.prisma.manualPayrollItemDefinition.findFirst({
      where: { id, deletedAt: null },
    });
    if (!row) throw new NotFoundException('Manual payroll item not found');
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);

    await this.prisma.manualPayrollItemDefinition.update({
      where: { id },
      data: {
        status: 'cancelled',
        updatedBy: actor.userId,
        deletedAt: new Date(),
        deletedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'ManualPayrollItemDefinition',
      entityId: id,
      action: 'cancel',
    });
  }

  async applyForCycle(
    actor: ActorContext,
    cycleId: string,
  ): Promise<ApplyManualPayrollItemsResult> {
    const cycle = await this.cycles.findById(cycleId);
    if (!cycle) throw new PayrollCycleNotFoundError(cycleId);
    await this.companyAccess.assertCompanyAccess(actor, cycle.companyId);
    cycle.assertOpen();

    const definitions = await this.prisma.manualPayrollItemDefinition.findMany({
      where: {
        companyId: cycle.companyId,
        deletedAt: null,
        status: 'active',
      },
    });

    let itemsCreated = 0;
    let itemsSkipped = 0;
    const definitionIds: string[] = [];

    for (const definition of definitions) {
      if (!isDefinitionEffectiveForPeriod(
        definition.effectiveFrom,
        definition.effectiveUntil,
        cycle.periodStart,
        cycle.periodEnd,
      )) {
        continue;
      }

      if (definition.scheduleType === 'one_time') {
        const alreadyApplied = await this.hasDefinitionApplied(definition.id, cycleId);
        if (alreadyApplied) {
          itemsSkipped++;
          continue;
        }
      } else {
        const alreadyApplied = await this.hasDefinitionApplied(definition.id, cycleId);
        if (alreadyApplied) {
          itemsSkipped++;
          continue;
        }
      }

      const created = await this.createPayrollItemFromDefinition(
        definition,
        cycleId,
        cycle.companyId,
        actor.userId,
      );
      if (created) {
        itemsCreated++;
        definitionIds.push(definition.id);
      } else {
        itemsSkipped++;
      }
    }

    return { cycleId, itemsCreated, itemsSkipped, definitionIds };
  }

  private async applyDefinitionToCycle(
    actor: ActorContext,
    definitionId: string,
    cycleId: string,
  ): Promise<void> {
    const cycle = await this.cycles.findById(cycleId);
    if (!cycle) throw new PayrollCycleNotFoundError(cycleId);
    await this.companyAccess.assertCompanyAccess(actor, cycle.companyId);
    cycle.assertOpen();

    const definition = await this.prisma.manualPayrollItemDefinition.findFirst({
      where: { id: definitionId, deletedAt: null, status: 'active' },
    });
    if (!definition) throw new NotFoundException('Manual payroll item not found');

    if (!isDefinitionEffectiveForPeriod(
      definition.effectiveFrom,
      definition.effectiveUntil,
      cycle.periodStart,
      cycle.periodEnd,
    )) {
      throw new BadRequestException('Definition is not effective for this payroll cycle period');
    }

    if (await this.hasDefinitionApplied(definition.id, cycleId)) {
      throw new BadRequestException('Definition already applied to this cycle');
    }

    const created = await this.createPayrollItemFromDefinition(
      definition,
      cycleId,
      cycle.companyId,
      actor.userId,
    );
    if (!created) {
      throw new BadRequestException('Could not apply manual payroll item to cycle');
    }
  }

  private async hasDefinitionApplied(definitionId: string, cycleId: string): Promise<boolean> {
    const prefix = `manual_item:${definitionId}`;
    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        deletedAt: null,
        note: { startsWith: prefix },
      },
      select: { id: true },
    });
    return Boolean(existing);
  }

  private async createPayrollItemFromDefinition(
    definition: {
      id: string;
      employeeId: string;
      category: ManualPayrollItemCategory;
      amount: Prisma.Decimal;
      note: string | null;
    },
    cycleId: string,
    companyId: string,
    actorUserId: string,
  ): Promise<boolean> {
    const meta = getManualPayrollCategoryMeta(definition.category);
    const signedAmount = signedAmountForCategory(
      definition.category,
      Number(definition.amount),
    );

    await this.items.create({
      payrollCycleId: cycleId,
      employeeId: definition.employeeId,
      companyId,
      itemType: meta.itemType as import('../domain/repositories/payroll.repository').PayrollItemRow['itemType'],
      amount: signedAmount,
      quantity: null,
      sourceRefType: null,
      sourceRefId: null,
      note: manualPayrollItemNote(definition.id, definition.category, definition.note),
    }, actorUserId);

    return true;
  }

  private toResponse(row: {
    id: string;
    companyId: string;
    employeeId: string;
    category: ManualPayrollItemCategory;
    amount: Prisma.Decimal;
    scheduleType: string;
    effectiveFrom: Date;
    effectiveUntil: Date | null;
    note: string | null;
    status: string;
  }): ManualPayrollItemDefinitionResponse {
    const meta = getManualPayrollCategoryMeta(row.category);
    return {
      id: row.id,
      companyId: row.companyId,
      employeeId: row.employeeId,
      category: row.category,
      categoryLabelTh: meta.labelTh,
      direction: meta.direction,
      amount: Number(row.amount),
      scheduleType: row.scheduleType as ManualPayrollItemDefinitionResponse['scheduleType'],
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveUntil: row.effectiveUntil?.toISOString().slice(0, 10) ?? null,
      note: row.note,
      status: row.status,
    };
  }
}

// Re-export for tests
export { extractManualPayrollDefinitionId };
