// ============================================================================
// modules/payroll/application/payroll-overview.service.ts
// PAY-007
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { PayrollCycleNotFoundError } from '../domain/errors/payroll.errors';
import { EmployeeNotFoundError } from '../../employee/domain/errors/employee.errors';
import {
  isBuilderGeneratedNote,
  BUILDER_MANAGED_ITEM_TYPES,
} from '../domain/payroll-builder.constants';
import { PayrollOverviewAccessService } from './payroll-overview-access.service';
import { PayrollOverviewAssemblerService } from './payroll-overview-assembler.service';
import {
  PayrollOverviewEmployeeDetail,
  PayrollOverviewQueryDto,
  PayrollOverviewResponse,
} from './dto/payroll-overview.dto';

@Injectable()
export class PayrollOverviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: PayrollOverviewAccessService,
    private readonly assembler: PayrollOverviewAssemblerService,
    private readonly audit: AuditService,
  ) {}

  async getOverview(
    actor: ActorContext,
    cycleId: string,
    query: PayrollOverviewQueryDto,
  ): Promise<PayrollOverviewResponse> {
    const cycle = await this.loadCycle(cycleId);
    const companyId = query.companyId?.trim() || cycle.companyId;
    if (companyId !== cycle.companyId) {
      throw new PayrollCycleNotFoundError(cycleId);
    }

    await this.access.assertCanViewCompanyOverview(actor, companyId);
    const company = await this.prisma.company.findFirst({
      where: { id: companyId, deletedAt: null },
      select: { name: true },
    });

    const { summary, employees } = await this.assembler.buildOverview(
      cycle,
      company?.name ?? '',
      query,
    );

    await this.audit.record(actor, {
      entityType: 'payroll_cycle',
      entityId: cycleId,
      action: 'payroll_overview_viewed',
      after: {
        companyId,
        employeeCount: employees.length,
        filters: query,
      },
    });

    const exceptions = employees.filter((row) => row.hasException);

    return {
      cycleId: cycle.id,
      companyId,
      companyName: company?.name ?? '',
      periodStart: cycle.periodStart.toISOString().slice(0, 10),
      periodEnd: cycle.periodEnd.toISOString().slice(0, 10),
      payDate: cycle.payDate.toISOString().slice(0, 10),
      cycleStatus: cycle.status,
      canExportBankTransfer: cycle.status === 'locked' || cycle.status === 'paid',
      summary,
      employees,
      exceptions,
    };
  }

  async getEmployeeDetail(
    actor: ActorContext,
    cycleId: string,
    employeeId: string,
  ): Promise<PayrollOverviewEmployeeDetail> {
    const cycle = await this.loadCycle(cycleId);
    await this.access.assertCanViewEmployeeRow(actor, employeeId, cycle.companyId);

    const company = await this.prisma.company.findFirst({
      where: { id: cycle.companyId, deletedAt: null },
      select: { name: true },
    });

    const row = await this.assembler.buildEmployeeRow(cycle, employeeId, company?.name ?? '');
    if (!row) {
      throw new EmployeeNotFoundError(employeeId);
    }

    const items = await this.prisma.payrollItem.findMany({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        deletedAt: null,
      },
      orderBy: [{ itemType: 'asc' }, { createdAt: 'asc' }],
    });

    const advances = await this.prisma.advanceRequest.findMany({
      where: {
        employeeId,
        companyId: cycle.companyId,
        deletedAt: null,
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    const componentLines = items.map((item) => ({
      id: item.id,
      itemType: item.itemType,
      amount: Number(item.amount),
      note: item.note,
      approved: isApprovedPayrollItem(item.itemType, item.note, item.sourceRefType),
      manualOverride: isManualOverrideNote(item.note),
    }));

    const salaryComponents = componentLines.filter((line) =>
      ['salary', 'meal_allowance', 'cross_border', 'leave_bonus', 'bonus', 'manual_adjustment'].includes(line.itemType)
      && line.amount >= 0,
    );
    const deductions = componentLines.filter((line) => line.amount < 0 || [
      'late_deduction', 'absence_deduction', 'deposit',
      'excess_off_deduction', 'break_deduction', 'consecutive_leave_deduction',
    ].includes(line.itemType));
    const overtime = componentLines.filter((line) => line.itemType === 'ot');
    const commission = componentLines.filter((line) =>
      ['commission', 'commission_adjustment', 'referral'].includes(line.itemType),
    );

    await this.audit.record(actor, {
      entityType: 'payroll_cycle',
      entityId: cycleId,
      action: 'payroll_overview_row_opened',
      after: { employeeId },
    });

    return {
      employeeId,
      employeeCode: row.employeeCode,
      employeeName: row.employeeName,
      cycleId,
      companyId: cycle.companyId,
      cycleStatus: cycle.status,
      canEditItems: cycle.status === 'open',
      salaryComponents,
      deductions,
      overtime,
      commission,
      advancePay: advances.map((advance) => ({
        advanceRequestId: advance.id,
        amount: Number(advance.amount),
        status: advance.status,
        recoveredInCycle: !!advance.recoveredPayrollItemId
          && items.some((item) => item.id === advance.recoveredPayrollItemId),
        note: advance.reason,
      })),
      payrollNotes: row.notes,
      historyLink: `/employees/${employeeId}`,
      row,
    };
  }

  async logExportInitiated(actor: ActorContext, cycleId: string): Promise<{ logged: true }> {
    const cycle = await this.loadCycle(cycleId);
    await this.access.assertCanViewCompanyOverview(actor, cycle.companyId);

    await this.audit.record(actor, {
      entityType: 'payroll_cycle',
      entityId: cycleId,
      action: 'payroll_overview_export_initiated',
    });

    return { logged: true };
  }

  private async loadCycle(cycleId: string) {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: cycleId, deletedAt: null },
    });
    if (!cycle) throw new PayrollCycleNotFoundError(cycleId);
    return cycle;
  }
}

function isApprovedPayrollItem(
  itemType: string,
  note: string | null,
  sourceRefType: string | null,
): boolean {
  if (isBuilderGeneratedNote(note)) return true;
  if (isManualOverrideNote(note)) return true;
  if (BUILDER_MANAGED_ITEM_TYPES.includes(itemType as typeof BUILDER_MANAGED_ITEM_TYPES[number])) {
    return true;
  }
  if (sourceRefType && sourceRefType !== 'manual') return true;
  return (note ?? '').includes('workflow:approved');
}

function isManualOverrideNote(note: string | null | undefined): boolean {
  return (note ?? '').startsWith('manual_override');
}
