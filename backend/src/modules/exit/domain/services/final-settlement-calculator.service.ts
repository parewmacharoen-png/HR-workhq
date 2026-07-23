// ============================================================================
// modules/exit/domain/services/final-settlement-calculator.service.ts
// PAY-005 — final payroll settlement calculation engine.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { ProrateService } from '../../../payroll/domain/services/prorate.service';
import { clampSalaryBandsToHireDate } from '../../../payroll/domain/services/salary-band-employment.util';
import { computeDepositSettlement } from './exit-reason-policy.service';
import type { ExitReason } from './exit-reason-policy.service';
import { LateDeductionAggregatorService } from '../../../payroll/application/late-deduction-aggregator.service';
import { AbsenceDeductionAggregatorService } from '../../../payroll/application/absence-deduction-aggregator.service';
import { DepositReadService } from '../../application/deposit-read.service';
import { DEPOSIT_REPOSITORY, DepositRepository } from '../../../payroll/domain/repositories/payroll.repository';
import { Inject } from '@nestjs/common';
import {
  sumUnpaidSalaryItems,
  UNPAID_SALARY_CYCLE_STATUSES,
} from './unpaid-salary.heuristic';

export interface FinalSettlementCalculationInput {
  employeeId: string;
  companyId: string;
  exitCaseId: string;
  exitReason: ExitReason;
  effectiveTerminationDate: Date;
}

export interface FinalSettlementCalculationResult {
  payrollCycleId: string | null;
  salaryProrateAmount: number;
  unpaidSalaryAmount: number;
  pendingOtAmount: number;
  pendingCommissionAmount: number;
  pendingBonusAmount: number;
  advanceDeductionAmount: number;
  equipmentDeductionAmount: number;
  penaltyDeductionAmount: number;
  depositReturnAmount: number;
  otherAdjustmentAmount: number;
  netPayableAmount: number;
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

@Injectable()
export class FinalSettlementCalculatorService {
  private readonly prorate = new ProrateService();

  constructor(
    private readonly prisma: PrismaService,
    private readonly depositRead: DepositReadService,
    @Inject(DEPOSIT_REPOSITORY) private readonly deposits: DepositRepository,
    private readonly lateDeductions: LateDeductionAggregatorService,
    private readonly absenceDeductions: AbsenceDeductionAggregatorService,
  ) {}

  async calculate(input: FinalSettlementCalculationInput): Promise<FinalSettlementCalculationResult> {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: {
        companyId: input.companyId,
        status: { in: ['open', 'locked'] },
        deletedAt: null,
        periodStart: { lte: input.effectiveTerminationDate },
        periodEnd: { gte: input.effectiveTerminationDate },
      },
      orderBy: { periodStart: 'desc' },
    }) ?? await this.prisma.payrollCycle.findFirst({
      where: { companyId: input.companyId, status: { in: ['open', 'locked'] }, deletedAt: null },
      orderBy: { periodStart: 'desc' },
    });

    const salaryProrateAmount = cycle
      ? await this.computeSalaryProrate(input, cycle.periodStart, cycle.periodEnd)
      : 0;

    const unpaidSalaryAmount = await this.sumUnpaidSalary(input.employeeId, input.companyId, cycle?.id ?? null);
    const pendingOtAmount = cycle
      ? await this.sumPendingOvertime(input.employeeId, input.companyId, cycle.periodStart, cycle.periodEnd)
      : 0;
    const pendingCommissionAmount = await this.sumPendingCommission(input.employeeId, input.companyId);
    const pendingBonusAmount = cycle
      ? await this.sumPendingBonus(input.employeeId, cycle.id)
      : 0;
    const advanceDeductionAmount = await this.sumOutstandingAdvances(input.employeeId, input.companyId);
    const equipmentDeductionAmount = await this.sumEquipmentClaims(input.exitCaseId);
    const penaltyDeductionAmount = cycle
      ? await this.sumPenalties(input.employeeId, input.companyId, cycle.periodStart, cycle.periodEnd, cycle.id)
      : 0;
    const depositReturnAmount = await this.computeDepositReturn(input);
    const otherAdjustmentAmount = 0;

    const netPayableAmount = roundMoney(
      salaryProrateAmount
      + unpaidSalaryAmount
      + pendingOtAmount
      + pendingCommissionAmount
      + pendingBonusAmount
      - advanceDeductionAmount
      - equipmentDeductionAmount
      - penaltyDeductionAmount
      + depositReturnAmount
      + otherAdjustmentAmount,
    );

    return {
      payrollCycleId: cycle?.id ?? null,
      salaryProrateAmount,
      unpaidSalaryAmount,
      pendingOtAmount,
      pendingCommissionAmount,
      pendingBonusAmount,
      advanceDeductionAmount,
      equipmentDeductionAmount,
      penaltyDeductionAmount,
      depositReturnAmount,
      otherAdjustmentAmount,
      netPayableAmount,
    };
  }

  static computeNetPayable(fields: Pick<
    FinalSettlementCalculationResult,
    | 'salaryProrateAmount'
    | 'unpaidSalaryAmount'
    | 'pendingOtAmount'
    | 'pendingCommissionAmount'
    | 'pendingBonusAmount'
    | 'advanceDeductionAmount'
    | 'equipmentDeductionAmount'
    | 'penaltyDeductionAmount'
    | 'depositReturnAmount'
    | 'otherAdjustmentAmount'
  >): number {
    return roundMoney(
      fields.salaryProrateAmount
      + fields.unpaidSalaryAmount
      + fields.pendingOtAmount
      + fields.pendingCommissionAmount
      + fields.pendingBonusAmount
      - fields.advanceDeductionAmount
      - fields.equipmentDeductionAmount
      - fields.penaltyDeductionAmount
      + fields.depositReturnAmount
      + fields.otherAdjustmentAmount,
    );
  }

  private async computeSalaryProrate(
    input: FinalSettlementCalculationInput,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const exitDate = input.effectiveTerminationDate;
    const prorateEnd = exitDate < periodEnd ? exitDate : periodEnd;
    if (prorateEnd < periodStart) return 0;

    const bands = await this.prisma.salaryHistory.findMany({
      where: {
        employeeId: input.employeeId,
        companyId: input.companyId,
        deletedAt: null,
        effectiveFrom: { lte: prorateEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
      },
      orderBy: { effectiveFrom: 'asc' },
    });

    if (bands.length === 0) return 0;

    const employee = await this.prisma.employee.findFirst({
      where: { id: input.employeeId, deletedAt: null },
      select: { hireDate: true },
    });
    const mappedBands = bands.map((b) => ({
      monthlySalary: Number(b.monthlySalary),
      effectiveFrom: b.effectiveFrom,
      effectiveTo: b.effectiveTo,
    }));
    const clampedBands = employee
      ? clampSalaryBandsToHireDate(
          mappedBands,
          employee.hireDate,
          periodStart,
          prorateEnd,
        )
      : mappedBands;

    const result = this.prorate.compute({
      periodStart,
      periodEnd: prorateEnd,
      bands: clampedBands,
    });
    return result.earnedAmount;
  }

  /** See unpaid-salary.heuristic.ts for PAY-005c rules and limitations. */
  async sumUnpaidSalary(
    employeeId: string,
    companyId: string,
    currentCycleId: string | null,
  ): Promise<number> {
    const cycles = await this.prisma.payrollCycle.findMany({
      where: {
        companyId,
        status: { in: [...UNPAID_SALARY_CYCLE_STATUSES] },
        deletedAt: null,
        ...(currentCycleId ? { id: { not: currentCycleId } } : {}),
      },
    });
    if (cycles.length === 0) return 0;

    const rows = await this.prisma.payrollItem.findMany({
      where: {
        employeeId,
        payrollCycleId: { in: cycles.map((c) => c.id) },
        itemType: 'salary',
        deletedAt: null,
      },
    });
    return sumUnpaidSalaryItems(rows.map((row) => ({ amount: Number(row.amount) })));
  }

  private async sumPendingOvertime(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const rows = await this.prisma.overtimeRecord.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        payrollItemId: null,
        workDate: { gte: periodStart, lte: periodEnd },
        deletedAt: null,
      },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  }

  private async sumPendingCommission(employeeId: string, companyId: string): Promise<number> {
    const rows = await this.prisma.commissionRecord.findMany({
      where: {
        employeeId,
        companyId,
        payrollItemId: null,
        status: { in: ['accrued', 'hold'] },
        deletedAt: null,
      },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.grossAmount), 0));
  }

  private async sumPendingBonus(employeeId: string, cycleId: string): Promise<number> {
    const rows = await this.prisma.payrollItem.findMany({
      where: {
        employeeId,
        payrollCycleId: cycleId,
        deletedAt: null,
        itemType: { in: ['bonus', 'manual_adjustment'] },
      },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Math.max(0, Number(row.amount)), 0));
  }

  private async sumOutstandingAdvances(employeeId: string, companyId: string): Promise<number> {
    const rows = await this.prisma.advanceRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        recoveredPayrollItemId: null,
        deletedAt: null,
      },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  }

  private async sumEquipmentClaims(exitCaseId: string): Promise<number> {
    const rows = await this.prisma.depositLossClaim.findMany({
      where: { exitCaseId, status: 'approved', deletedAt: null },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  }

  private async sumPenalties(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
    cycleId: string,
  ): Promise<number> {
    const late = await this.lateDeductions.aggregateForPeriod(
      employeeId,
      companyId,
      periodStart,
      periodEnd,
    );
    const absence = await this.absenceDeductions.aggregateForPeriod(
      employeeId,
      companyId,
      periodStart,
      periodEnd,
      cycleId,
    );
    return roundMoney(late.totalDeduction + absence.totalDeduction);
  }

  private async computeDepositReturn(input: FinalSettlementCalculationInput): Promise<number> {
    const cycleStart = await this.depositRead.resolveDepositCycleStart(input.employeeId);
    const depositBalance = await this.deposits.getEmployeeBalance(input.employeeId, cycleStart);
    const claims = await this.prisma.depositLossClaim.findMany({
      where: { exitCaseId: input.exitCaseId, status: 'approved', deletedAt: null },
    });
    const approvedClaimsTotal = roundMoney(
      claims.reduce((sum, row) => sum + Number(row.amount), 0),
    );
    const settlement = computeDepositSettlement({
      exitReason: input.exitReason,
      depositBalance,
      approvedClaimsTotal,
    });
    return settlement.refundAmount;
  }
}
