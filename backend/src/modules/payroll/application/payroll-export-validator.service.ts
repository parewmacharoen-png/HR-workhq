// ============================================================================
// modules/payroll/application/payroll-export-validator.service.ts
// PAY-006 — assemble export rows and validate cycle/items.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { MANUAL_ADJUSTMENT_ITEM_TYPES } from '../domain/payroll-builder.constants';
import { resolveThBankName } from '../domain/services/th-bank-names';
import { PayrollExportCycleNotApprovedError } from '../domain/errors/payroll-export.errors';
import { PayrollCycleNotFoundError } from '../domain/errors/payroll.errors';
import type {
  PayrollExportComponentSnapshot,
  PayrollExportExceptionFlag,
  PayrollExportItemResponse,
  PayrollExportPreviewResponse,
} from './dto/payroll-export.dto';

interface CycleContext {
  id: string;
  companyId: string;
  status: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
}

export interface PreparedPayrollExport {
  cycle: CycleContext;
  items: PayrollExportItemResponse[];
  includedCount: number;
  exceptionCount: number;
  totalNetPayAmount: number;
}

@Injectable()
export class PayrollExportValidatorService {
  constructor(private readonly prisma: PrismaService) {}

  async prepareForCycle(cycleId: string): Promise<PreparedPayrollExport> {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, deletedAt: null },
    });
    if (!cycle) {
      throw new PayrollCycleNotFoundError(cycleId);
    }
    if (cycle.status !== 'locked' && cycle.status !== 'paid') {
      throw new PayrollExportCycleNotApprovedError();
    }

    const payrollItems = await this.prisma.payrollItem.findMany({
      where: { payrollCycleId: cycleId, deletedAt: null },
      orderBy: [{ employeeId: 'asc' }, { itemType: 'asc' }],
    });

    const employeeIds = [...new Set(payrollItems.map((row) => row.employeeId))];
    if (employeeIds.length === 0) {
      return {
        cycle: this.toCycleContext(cycle),
        items: [],
        includedCount: 0,
        exceptionCount: 0,
        totalNetPayAmount: 0,
      };
    }

    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds }, deletedAt: null },
      include: {
        bankAccounts: {
          where: { deletedAt: null, isPrimary: true },
          take: 1,
        },
        assignments: {
          where: {
            companyId: cycle.companyId,
            deletedAt: null,
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: cycle.periodStart } }],
          },
          include: { team: true },
          orderBy: [{ isPrimaryTeam: 'desc' }, { effectiveFrom: 'desc' }],
          take: 1,
        },
      },
    });
    const employeeMap = new Map(employees.map((row) => [row.id, row]));

    const grouped = new Map<string, typeof payrollItems>();
    for (const item of payrollItems) {
      const list = grouped.get(item.employeeId) ?? [];
      list.push(item);
      grouped.set(item.employeeId, list);
    }

    const items: PayrollExportItemResponse[] = [];
    let includedCount = 0;
    let exceptionCount = 0;
    let totalNetPayAmount = 0;

    for (const employeeId of employeeIds) {
      const employeeItems = grouped.get(employeeId) ?? [];
      const employee = employeeMap.get(employeeId);
      if (!employee) continue;

      const components = employeeItems.map((row): PayrollExportComponentSnapshot => ({
        itemType: row.itemType,
        amount: Number(row.amount),
        note: row.note,
      }));
      const netPayAmount = components.reduce((sum, row) => sum + row.amount, 0);
      const bank = employee.bankAccounts[0] ?? null;
      const assignment = employee.assignments[0] ?? null;
      const exceptionFlags = this.collectExceptionFlags(employeeItems, netPayAmount, bank);

      const exportStatus = exceptionFlags.length > 0 ? 'exception' : 'included';
      if (exportStatus === 'included') {
        includedCount++;
        totalNetPayAmount += netPayAmount;
      } else {
        exceptionCount++;
      }

      items.push({
        id: '',
        employeeId,
        employeeCode: employee.globalId,
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
        department: employee.department,
        teamName: assignment?.team?.name ?? null,
        bankName: resolveThBankName(bank?.bankCode),
        bankAccountNo: bank?.accountNo ?? null,
        bankAccountName: bank?.accountName ?? null,
        netPayAmount,
        payrollComponents: components,
        exportStatus,
        exceptionFlags,
      });
    }

    return {
      cycle: this.toCycleContext(cycle),
      items,
      includedCount,
      exceptionCount,
      totalNetPayAmount,
    };
  }

  toPreview(prepared: PreparedPayrollExport): PayrollExportPreviewResponse {
    const exceptions = prepared.items.filter((row) => row.exportStatus === 'exception');
    return {
      cycleId: prepared.cycle.id,
      companyId: prepared.cycle.companyId,
      cycleStatus: prepared.cycle.status,
      canExport: true,
      blockedReason: null,
      includedCount: prepared.includedCount,
      exceptionCount: prepared.exceptionCount,
      totalNetPayAmount: prepared.totalNetPayAmount,
      items: prepared.items,
      exceptions,
    };
  }

  private collectExceptionFlags(
    items: Array<{ itemType: string; note: string | null }>,
    netPayAmount: number,
    bank: { accountNo: string } | null,
  ): PayrollExportExceptionFlag[] {
    const flags: PayrollExportExceptionFlag[] = [];
    if (!bank?.accountNo?.trim()) {
      flags.push('missing_bank_account');
    }
    if (netPayAmount <= 0) {
      flags.push('net_pay_non_positive');
    }
    const hasPendingAdjustment = items.some((row) => {
      if (!MANUAL_ADJUSTMENT_ITEM_TYPES.includes(row.itemType as typeof MANUAL_ADJUSTMENT_ITEM_TYPES[number])) {
        return false;
      }
      const note = row.note ?? '';
      return !note.includes('workflow:approved');
    });
    if (hasPendingAdjustment) {
      flags.push('pending_adjustment');
    }
    return flags;
  }

  private toCycleContext(cycle: {
    id: string;
    companyId: string;
    status: string;
    periodStart: Date;
    periodEnd: Date;
    payDate: Date;
  }): CycleContext {
    return {
      id: cycle.id,
      companyId: cycle.companyId,
      status: cycle.status,
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      payDate: cycle.payDate,
    };
  }
}

export function decimalFromNumber(value: number): Prisma.Decimal {
  return new Prisma.Decimal(value.toFixed(2));
}
