// ============================================================================
// modules/workday/application/workday-payroll-preview.service.ts
// Foundation Sprint — payroll impact preview (not final payroll).
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { BangkokTimeProvider } from '../../../shared/time/bangkok-time.provider';
import { LateDeductionAggregatorService } from '../../payroll/application/late-deduction-aggregator.service';
import { isUnpaidLeaveType } from '../../leave/domain/services/leave-type-classification';
import {
  isDefinitionEffectiveForPeriod,
  signedAmountForCategory,
  type ManualPayrollItemCategory,
} from '../../payroll/domain/manual-payroll-item.constants';

export interface PayrollPreviewDto {
  employeeId: string;
  companyId: string;
  month: string;
  baseSalary: number;
  approvedOvertime: number;
  manualBonus: number;
  manualCommission: number;
  manualAllowance: number;
  manualDeduction: number;
  lateDeduction: number;
  unpaidLeaveDeduction: number;
  netPreview: number;
  needsRecalculation: boolean;
  needsRecalculationWarning: string | null;
  breakdown: Array<{ label: string; amount: number; direction: 'earning' | 'deduction' }>;
}

const BONUS_CATEGORIES = new Set<ManualPayrollItemCategory>(['bonus', 'diligence_bonus']);
const COMMISSION_CATEGORIES = new Set<ManualPayrollItemCategory>(['commission']);
const ALLOWANCE_CATEGORIES = new Set<ManualPayrollItemCategory>([
  'meal_allowance',
  'phone_allowance',
  'fuel_allowance',
  'travel_allowance',
  'other_earning',
]);
const DEDUCTION_CATEGORIES = new Set<ManualPayrollItemCategory>([
  'utility_deduction',
  'deposit_deduction',
  'advance_deduction',
  'penalty',
  'tax_deduction',
  'other_deduction',
]);

@Injectable()
export class WorkDayPayrollPreviewService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly time: BangkokTimeProvider,
    private readonly lateDeductions: LateDeductionAggregatorService,
  ) {}

  async preview(employeeId: string, companyId: string, month: string): Promise<PayrollPreviewDto> {
    const periodStart = this.time.parseWorkDate(`${month}-01`);
    const periodEnd = new Date(Date.UTC(
      periodStart.getUTCFullYear(),
      periodStart.getUTCMonth() + 1,
      0,
    ));

    const [salaryBand, otRows, manualDefs, needsRecalcCount] = await Promise.all([
      this.prisma.salaryHistory.findFirst({
        where: {
          employeeId,
          deletedAt: null,
          effectiveFrom: { lte: periodEnd },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
        },
        orderBy: { effectiveFrom: 'desc' },
        select: { monthlySalary: true },
      }),
      this.prisma.overtimeRecord.findMany({
        where: {
          employeeId,
          companyId,
          workDate: { gte: periodStart, lte: periodEnd },
          status: 'approved',
          deletedAt: null,
        },
        select: { amount: true },
      }),
      this.prisma.manualPayrollItemDefinition.findMany({
        where: {
          employeeId,
          companyId,
          status: 'active',
          deletedAt: null,
        },
      }),
      this.prisma.attendanceRecord.count({
        where: {
          employeeId,
          companyId,
          workDate: { gte: periodStart, lte: periodEnd },
          needsRecalculation: true,
          deletedAt: null,
        },
      }),
    ]);

    const baseSalary = salaryBand ? Number(salaryBand.monthlySalary) : 0;
    const approvedOvertime = otRows.reduce((sum, row) => sum + Number(row.amount), 0);

    let manualBonus = 0;
    let manualCommission = 0;
    let manualAllowance = 0;
    let manualDeduction = 0;
    for (const def of manualDefs) {
      if (!isDefinitionEffectiveForPeriod(
        def.effectiveFrom,
        def.effectiveUntil,
        periodStart,
        periodEnd,
      )) continue;
      const category = def.category as ManualPayrollItemCategory;
      const amount = signedAmountForCategory(category, Number(def.amount));
      if (BONUS_CATEGORIES.has(category)) manualBonus += amount;
      else if (COMMISSION_CATEGORIES.has(category)) manualCommission += amount;
      else if (ALLOWANCE_CATEGORIES.has(category)) manualAllowance += amount;
      else if (DEDUCTION_CATEGORIES.has(category)) manualDeduction += Math.abs(amount);
    }

    const lateSummary = await this.lateDeductions.aggregateForPeriod(
      employeeId,
      companyId,
      periodStart,
      periodEnd,
    );
    const lateDeduction = lateSummary.totalDeduction;

    const unpaidLeaveDeduction = await this.estimateUnpaidLeaveDeduction(
      employeeId,
      companyId,
      periodStart,
      periodEnd,
      baseSalary,
    );

    const needsRecalculation = needsRecalcCount > 0;
    const earnings = baseSalary + approvedOvertime + manualBonus + manualCommission + manualAllowance;
    const deductions = lateDeduction + unpaidLeaveDeduction + manualDeduction;
    const netPreview = Math.round((earnings - deductions) * 100) / 100;

    const breakdown: PayrollPreviewDto['breakdown'] = [
      { label: 'ฐานเงินเดือน', amount: baseSalary, direction: 'earning' as const },
      { label: 'OT (อนุมัติแล้ว)', amount: approvedOvertime, direction: 'earning' as const },
      { label: 'โบนัส', amount: manualBonus, direction: 'earning' as const },
      { label: 'ค่าคอมมิชชั่น', amount: manualCommission, direction: 'earning' as const },
      { label: 'เบี้ยเลี้ยง/สวัสดิการ', amount: manualAllowance, direction: 'earning' as const },
      { label: 'หักมาสาย', amount: lateDeduction, direction: 'deduction' as const },
      { label: 'หักลาไม่รับค่าจ้าง', amount: unpaidLeaveDeduction, direction: 'deduction' as const },
      { label: 'หักอื่นๆ (manual)', amount: manualDeduction, direction: 'deduction' as const },
    ].filter((row) => row.amount !== 0);

    return {
      employeeId,
      companyId,
      month,
      baseSalary,
      approvedOvertime,
      manualBonus,
      manualCommission,
      manualAllowance,
      manualDeduction,
      lateDeduction,
      unpaidLeaveDeduction,
      netPreview,
      needsRecalculation,
      needsRecalculationWarning: needsRecalculation
        ? 'มีรายการเข้างานที่ต้องคำนวณใหม่ — ยอดนี้ยังไม่ถือเป็นยอดสุดท้าย'
        : null,
      breakdown,
    };
  }

  private async estimateUnpaidLeaveDeduction(
    employeeId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
    monthlySalary: number,
  ): Promise<number> {
    if (monthlySalary <= 0) return 0;
    const dailyRate = monthlySalary / 30;
    const leaves = await this.prisma.leaveRequest.findMany({
      where: {
        employeeId,
        companyId,
        status: 'approved',
        deletedAt: null,
        startDate: { lte: periodEnd },
        endDate: { gte: periodStart },
      },
      include: { leaveType: { select: { code: true } } },
    });

    let unpaidDays = 0;
    const startIso = periodStart.toISOString().slice(0, 10);
    const endIso = periodEnd.toISOString().slice(0, 10);
    for (const leave of leaves) {
      if (!isUnpaidLeaveType(leave.leaveType.code)) continue;
      const from = leave.startDate.toISOString().slice(0, 10);
      const to = leave.endDate.toISOString().slice(0, 10);
      const overlapStart = from > startIso ? from : startIso;
      const overlapEnd = to < endIso ? to : endIso;
      if (overlapStart > overlapEnd) continue;
      unpaidDays += countDaysInclusive(overlapStart, overlapEnd);
    }
    return Math.round(unpaidDays * dailyRate * 100) / 100;
  }
}

function countDaysInclusive(startIso: string, endIso: string): number {
  const start = new Date(`${startIso}T00:00:00.000Z`);
  const end = new Date(`${endIso}T00:00:00.000Z`);
  return Math.floor((end.getTime() - start.getTime()) / 86400000) + 1;
}
