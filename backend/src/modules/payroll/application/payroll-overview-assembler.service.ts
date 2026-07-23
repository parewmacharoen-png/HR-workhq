// ============================================================================
// modules/payroll/application/payroll-overview-assembler.service.ts
// PAY-007 — build overview rows from cycle payroll data.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EmployeeEventsService } from '../../employee/application/employee-events.service';
import { resolveThBankName } from '../domain/services/th-bank-names';
import {
  collectPayrollOverviewExceptions,
  derivePayrollStatus,
  maskBankAccountNo,
} from '../domain/payroll-overview.exceptions';
import type {
  PayrollOverviewEmployeeRow,
  PayrollOverviewQueryDto,
  PayrollOverviewSummary,
} from './dto/payroll-overview.dto';

interface CycleRecord {
  id: string;
  companyId: string;
  periodStart: Date;
  periodEnd: Date;
  payDate: Date;
  status: string;
}

type PayrollItemRow = {
  employeeId: string;
  itemType: string;
  amount: Prisma.Decimal;
  quantity: Prisma.Decimal | null;
  note: string | null;
  sourceRefType: string | null;
};

@Injectable()
export class PayrollOverviewAssemblerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employeeEvents: EmployeeEventsService,
  ) {}

  async buildEmployeeRow(
    cycle: CycleRecord,
    employeeId: string,
    companyName: string,
  ): Promise<PayrollOverviewEmployeeRow | null> {
    const result = await this.buildOverview(cycle, companyName, {});
    return result.employees.find((row) => row.employeeId === employeeId) ?? null;
  }

  async buildOverview(
    cycle: CycleRecord,
    companyName: string,
    filters: PayrollOverviewQueryDto,
  ): Promise<{ summary: PayrollOverviewSummary; employees: PayrollOverviewEmployeeRow[] }> {
    const employees = await this.loadEmployees(cycle, filters);
    if (employees.length === 0) {
      return { summary: emptySummary(), employees: [] };
    }

    const employeeIds = employees.map((row) => row.id);
    const payrollItems = await this.prisma.payrollItem.findMany({
      where: {
        payrollCycleId: cycle.id,
        employeeId: { in: employeeIds },
        deletedAt: null,
      },
    });

    const itemsByEmployee = new Map<string, PayrollItemRow[]>();
    for (const item of payrollItems) {
      const list = itemsByEmployee.get(item.employeeId) ?? [];
      list.push(item);
      itemsByEmployee.set(item.employeeId, list);
    }

    const paidSettlements = await this.prisma.finalPayrollSettlement.findMany({
      where: {
        companyId: cycle.companyId,
        employeeId: { in: employeeIds },
        status: 'paid',
      },
      select: { employeeId: true },
    });
    const paidSettlementSet = new Set(paidSettlements.map((row) => row.employeeId));

    const rows: PayrollOverviewEmployeeRow[] = [];
    for (const employee of employees) {
      const items = itemsByEmployee.get(employee.id) ?? [];
      const assignment = employee.assignments[0] ?? null;
      const bank = employee.bankAccounts[0] ?? null;
      const amounts = this.sumAmounts(items);
      const exceptionReasons = collectPayrollOverviewExceptions({
        items: items.map((row) => ({
          itemType: row.itemType,
          note: row.note,
          sourceRefType: row.sourceRefType,
        })),
        netPayAmount: amounts.netPayAmount,
        bank: bank
          ? { accountNo: bank.accountNo, accountName: bank.accountName }
          : null,
        employmentStatus: employee.employmentStatus,
        hasPaidFinalSettlement: paidSettlementSet.has(employee.id),
      });
      const hasException = exceptionReasons.length > 0;
      const payrollStatus = derivePayrollStatus(
        items.length > 0,
        amounts.netPayAmount,
        hasException,
      );
      const notes = items
        .map((row) => row.note)
        .filter((note): note is string => !!note?.trim());

      rows.push({
        employeeId: employee.id,
        employeeCode: employee.globalId,
        employeeName: `${employee.firstName} ${employee.lastName}`.trim(),
        companyName,
        department: employee.department,
        teamName: assignment?.team?.name ?? null,
        position: employee.position,
        hireDate: employee.hireDate.toISOString().slice(0, 10),
        tenureDisplay: this.employeeEvents.buildTenureInfo(employee.hireDate).tenureDisplay,
        baseSalary: amounts.baseSalary,
        mealAllowance: amounts.mealAllowance,
        mealEligibleDays: amounts.mealEligibleDays,
        crossBorderAllowance: amounts.crossBorderAllowance,
        crossBorderEligibleDays: amounts.crossBorderEligibleDays,
        otAmount: amounts.otAmount,
        commissionAmount: amounts.commissionAmount,
        bonusAmount: amounts.bonusAmount,
        lateDeduction: amounts.lateDeduction,
        absenceDeduction: amounts.absenceDeduction,
        leaveDeduction: amounts.leaveDeduction,
        advanceDeduction: amounts.advanceDeduction,
        deposit: amounts.deposit,
        otherDeduction: amounts.otherDeduction,
        totalDeduction: amounts.totalDeduction,
        netPayAmount: amounts.netPayAmount,
        payrollStatus,
        bankName: resolveThBankName(bank?.bankCode),
        bankAccountNoMasked: maskBankAccountNo(bank?.accountNo),
        bankAccountName: bank?.accountName ?? null,
        notes,
        hasException,
        exceptionReasons,
      });
    }

    const filtered = this.applyPayrollStatusFilter(rows, filters.payrollStatus);
    return {
      summary: this.aggregateSummary(filtered),
      employees: filtered,
    };
  }

  private async loadEmployees(cycle: CycleRecord, filters: PayrollOverviewQueryDto) {
    const where: Prisma.EmployeeWhereInput = {
      deletedAt: null,
      assignments: {
        some: {
          companyId: cycle.companyId,
          deletedAt: null,
          effectiveFrom: { lte: cycle.periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: cycle.periodStart } }],
          ...(filters.teamId ? { teamId: filters.teamId } : {}),
        },
      },
      ...(filters.department
        ? { department: { contains: filters.department, mode: 'insensitive' } }
        : {}),
      ...(filters.position
        ? { position: { contains: filters.position, mode: 'insensitive' } }
        : {}),
      ...(filters.employmentStatus
        ? { employmentStatus: filters.employmentStatus as Prisma.EnumEmploymentStatusFilter['equals'] }
        : {}),
    };

    return this.prisma.employee.findMany({
      where,
      include: {
        bankAccounts: {
          where: { deletedAt: null, isPrimary: true },
          take: 1,
        },
        assignments: {
          where: {
            companyId: cycle.companyId,
            deletedAt: null,
            effectiveFrom: { lte: cycle.periodEnd },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: cycle.periodStart } }],
            ...(filters.teamId ? { teamId: filters.teamId } : {}),
          },
          include: { team: true },
          orderBy: [{ isPrimaryTeam: 'desc' }, { effectiveFrom: 'desc' }],
          take: 1,
        },
      },
      orderBy: { globalId: 'asc' },
    });
  }

  private sumAmounts(items: PayrollItemRow[]) {
    let baseSalary = 0;
    let mealAllowance = 0;
    let mealEligibleDays = 0;
    let crossBorderAllowance = 0;
    let crossBorderEligibleDays = 0;
    let otAmount = 0;
    let commissionAmount = 0;
    let bonusAmount = 0;
    let lateDeduction = 0;
    let absenceDeduction = 0;
    let leaveDeduction = 0;
    let advanceDeduction = 0;
    let deposit = 0;
    let otherDeduction = 0;
    let netPayAmount = 0;

    for (const item of items) {
      const amount = Number(item.amount);
      netPayAmount += amount;

      switch (item.itemType) {
        case 'salary':
          baseSalary += amount;
          break;
        case 'meal_allowance':
          mealAllowance += amount;
          mealEligibleDays += Number(item.quantity ?? 0);
          break;
        case 'cross_border':
          crossBorderAllowance += amount;
          crossBorderEligibleDays += Number(item.quantity ?? 0);
          break;
        case 'ot':
          otAmount += amount;
          break;
        case 'commission':
        case 'commission_adjustment':
        case 'referral':
          commissionAmount += amount;
          break;
        case 'bonus':
        case 'leave_bonus':
          bonusAmount += amount;
          break;
        case 'late_deduction':
          lateDeduction += Math.abs(amount);
          break;
        case 'absence_deduction':
          absenceDeduction += Math.abs(amount);
          break;
        case 'excess_off_deduction':
          leaveDeduction += Math.abs(amount);
          break;
        case 'break_deduction':
        case 'consecutive_leave_deduction':
          leaveDeduction += Math.abs(amount);
          break;
        case 'deposit':
          deposit += Math.abs(amount);
          break;
        case 'manual_adjustment':
          if (item.sourceRefType === 'advance' || (item.note ?? '').toLowerCase().includes('advance')) {
            advanceDeduction += Math.abs(amount);
          } else if (amount >= 0) {
            bonusAmount += amount;
          } else {
            otherDeduction += Math.abs(amount);
          }
          break;
        default:
          if (amount < 0) otherDeduction += Math.abs(amount);
          else bonusAmount += amount;
          break;
      }

      if (item.sourceRefType === 'advance' && item.itemType !== 'manual_adjustment') {
        advanceDeduction += Math.abs(amount);
      }
    }

    if (mealEligibleDays <= 0 && mealAllowance > 0) {
      const mealNote = items.find((item) => item.itemType === 'meal_allowance')?.note ?? '';
      const match = mealNote.match(/(\d+(?:\.\d+)?)\s*วัน/);
      if (match) mealEligibleDays = Number(match[1]);
    }
    if (crossBorderEligibleDays <= 0 && crossBorderAllowance > 0) {
      const note = items.find((item) => item.itemType === 'cross_border')?.note ?? '';
      const match = note.match(/(\d+(?:\.\d+)?)\s*วันออฟฟิศ/);
      if (match) crossBorderEligibleDays = Number(match[1]);
    }

    const totalDeduction = lateDeduction
      + absenceDeduction
      + leaveDeduction
      + advanceDeduction
      + deposit
      + otherDeduction;

    return {
      baseSalary: roundMoney(baseSalary),
      mealAllowance: roundMoney(mealAllowance),
      mealEligibleDays: roundMoney(mealEligibleDays),
      crossBorderAllowance: roundMoney(crossBorderAllowance),
      crossBorderEligibleDays: roundMoney(crossBorderEligibleDays),
      otAmount: roundMoney(otAmount),
      commissionAmount: roundMoney(commissionAmount),
      bonusAmount: roundMoney(bonusAmount),
      lateDeduction: roundMoney(lateDeduction),
      absenceDeduction: roundMoney(absenceDeduction),
      leaveDeduction: roundMoney(leaveDeduction),
      advanceDeduction: roundMoney(advanceDeduction),
      deposit: roundMoney(deposit),
      otherDeduction: roundMoney(otherDeduction),
      totalDeduction: roundMoney(totalDeduction),
      netPayAmount: roundMoney(netPayAmount),
    };
  }

  private applyPayrollStatusFilter(
    rows: PayrollOverviewEmployeeRow[],
    payrollStatus?: string,
  ): PayrollOverviewEmployeeRow[] {
    if (!payrollStatus?.trim()) return rows;
    const normalized = payrollStatus.trim().toLowerCase();
    if (normalized === 'exception') {
      return rows.filter((row) => row.hasException);
    }
    return rows.filter((row) => row.payrollStatus === normalized);
  }

  private aggregateSummary(rows: PayrollOverviewEmployeeRow[]): PayrollOverviewSummary {
    return {
      totalEmployees: rows.length,
      totalBaseSalary: sumField(rows, 'baseSalary'),
      totalMealAllowance: sumField(rows, 'mealAllowance'),
      totalOtAmount: sumField(rows, 'otAmount'),
      totalCommissionAmount: sumField(rows, 'commissionAmount'),
      totalBonusAmount: sumField(rows, 'bonusAmount'),
      totalDeductionAmount: sumField(rows, 'totalDeduction'),
      totalAdvanceDeductionAmount: sumField(rows, 'advanceDeduction'),
      totalNetPayAmount: sumField(rows, 'netPayAmount'),
      missingBankAccountCount: rows.filter((row) => row.exceptionReasons.includes('missing_bank_account')).length,
      zeroOrNegativeNetPayCount: rows.filter((row) => row.netPayAmount <= 0).length,
      pendingAdjustmentCount: rows.filter((row) => row.exceptionReasons.includes('pending_adjustment')).length,
    };
  }
}

function sumField(rows: PayrollOverviewEmployeeRow[], key: keyof PayrollOverviewEmployeeRow): number {
  return roundMoney(rows.reduce((sum, row) => sum + Number(row[key] ?? 0), 0));
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

function emptySummary(): PayrollOverviewSummary {
  return {
    totalEmployees: 0,
    totalBaseSalary: 0,
    totalMealAllowance: 0,
    totalOtAmount: 0,
    totalCommissionAmount: 0,
    totalBonusAmount: 0,
    totalDeductionAmount: 0,
    totalAdvanceDeductionAmount: 0,
    totalNetPayAmount: 0,
    missingBankAccountCount: 0,
    zeroOrNegativeNetPayCount: 0,
    pendingAdjustmentCount: 0,
  };
}
