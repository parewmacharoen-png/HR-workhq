// ============================================================================
// modules/payroll/application/payroll-builder.service.ts
// Cycle-level payroll orchestration — preview + idempotent build.
// ============================================================================

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { DepositSettingsService } from '../../settings/application/deposit-settings.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import { PayrollSettingsService } from '../../settings/application/payroll-settings.service';
import {
  PAYROLL_CYCLE_REPOSITORY,
  PAYROLL_ITEM_REPOSITORY,
  DEPOSIT_REPOSITORY,
  SALARY_REPOSITORY,
  PayrollCycleRepository,
  PayrollItemRepository,
  DepositRepository,
  SalaryRepository,
  PayrollItemRow,
} from '../domain/repositories/payroll.repository';
import { PayrollCycle } from '../domain/entities/payroll-cycle.entity';
import {
  PayrollCycleNotFoundError,
  PayrollCycleLockedError,
  PayrollCyclePaidError,
  DepositCapExceededError,
} from '../domain/errors/payroll.errors';
import { ProrateService } from '../domain/services/prorate.service';
import { clampSalaryBandsToHireDate } from '../domain/services/salary-band-employment.util';
import { computeMonthlyOffEntitlement } from '../../leave/domain/services/monthly-off-entitlement.service';
import {
  computeLeaveBonus,
  toLeaveBonusParams,
} from '../domain/services/leave-bonus.service';
import { computeMealAllowance } from '../domain/services/meal-allowance.service';
import { formatLateDeductionNote, LateDeductionSummary } from '../domain/services/late-deduction.service';
import {
  AbsenceDeductionSummary,
  formatAbsenceDeductionNote,
} from '../domain/services/absence-deduction.service';
import {
  BreakDeductionSummary,
  formatBreakDeductionNote,
} from '../domain/services/break-deduction.service';
import {
  ConsecutiveLeavePenaltySummary,
  formatConsecutiveLeavePenaltyNote,
} from '../domain/services/consecutive-leave-penalty.service';
import {
  ExcessOffDayDeductionSummary,
  formatExcessOffDayDeductionNote,
} from '../domain/services/excess-off-day-deduction.service';
import {
  builderNote,
  BUILDER_MANAGED_ITEM_TYPES,
  COMMISSION_ITEM_TYPES,
  COMMISSION_SOURCE_REF_TYPES,
  isBuilderGeneratedNote,
  MANUAL_ADJUSTMENT_ITEM_TYPES,
} from '../domain/payroll-builder.constants';
import { LateDeductionAggregatorService } from './late-deduction-aggregator.service';
import { AbsenceDeductionAggregatorService } from './absence-deduction-aggregator.service';
import { ExcessOffDayAggregatorService } from './excess-off-day-aggregator.service';
import { ShortNoticeLeaveAggregatorService } from './short-notice-leave-aggregator.service';
import {
  formatShortNoticeLeaveDeductionNote,
  type ShortNoticeLeaveDeductionSummary,
} from '../domain/services/short-notice-leave-deduction.service';
import { BreakDeductionAggregatorService } from './break-deduction-aggregator.service';
import { ConsecutiveLeavePenaltyAggregatorService } from './consecutive-leave-penalty-aggregator.service';
import { MealEligibleDaysService } from './meal-eligible-days.service';
import { UsedOffDaysService } from './used-off-days.service';
import { ManualPayrollItemService } from './manual-payroll-item.service';
import { shouldDeferDeposit } from '../domain/services/deposit-deferral.service';
import {
  PayrollBuilderEmployeePreview,
  PayrollBuilderPreviewResponse,
  PayrollBuilderPreviewTotals,
  PayrollBuilderResultResponse,
} from './dto/payroll-builder.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import type { SharedPayrollService } from './shared-payroll.service';
import { SHARED_PAYROLL_SERVICE } from './shared-payroll.service.token';

interface EligibleEmployee {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  workCategory: 'office' | 'wfh';
  hireDate: Date;
  terminationDate: Date | null;
  depositDeductionExempt: boolean;
  depositCollectionCompanyId: string | null;
  payrollAllocationMode: 'standard' | 'shared_across_companies';
}

interface EmployeeComputed {
  salary: number;
  mealAllowance: number;
  crossBorderAllowance: number;
  officeDays: number;
  wfhDays: number;
  lateDeduction: number;
  absenceDeduction: number;
  excessOffDeduction: number;
  breakDeduction: number;
  consecutiveLeaveDeduction: number;
  leaveBonus: number;
  overtime: number;
  commission: number;
  manualAdjustments: number;
  deposit: number;
  depositDeferred: boolean;
  warnings: string[];
  salaryQuantity: number | null;
  salaryMonthlyBase: number | null;
  salaryDays: number;
  salaryPeriodDays: number;
  mealEligibleDays: number;
  mealRatePerDay: number;
  crossBorderRatePerDay: number;
  leaveBonusDays: number;
  leaveBonusRatePerDay: number;
  offEntitlementNote: string | null;
  lateDeductionSources: LateDeductionSummary;
  absenceDeductionSources: AbsenceDeductionSummary;
  excessOffDeductionSources: ExcessOffDayDeductionSummary;
  shortNoticeLeaveDeductionSources: ShortNoticeLeaveDeductionSummary;
  breakDeductionSources: BreakDeductionSummary;
  consecutiveLeaveDeductionSources: ConsecutiveLeavePenaltySummary;
}

type UpsertOutcome = 'created' | 'updated' | 'skipped';

@Injectable()
export class PayrollBuilderService {
  private readonly logger = new Logger(PayrollBuilderService.name);
  private readonly prorate = new ProrateService();

  constructor(
    @Inject(PAYROLL_CYCLE_REPOSITORY) private readonly cycles: PayrollCycleRepository,
    @Inject(PAYROLL_ITEM_REPOSITORY) private readonly items: PayrollItemRepository,
    @Inject(SALARY_REPOSITORY) private readonly salaries: SalaryRepository,
    @Inject(DEPOSIT_REPOSITORY) private readonly deposits: DepositRepository,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly depositSettings: DepositSettingsService,
    private readonly leaveSettings: LeaveSettingsService,
    private readonly payrollSettings: PayrollSettingsService,
    private readonly lateDeductions: LateDeductionAggregatorService,
    private readonly absenceDeductions: AbsenceDeductionAggregatorService,
    private readonly excessOffDeductions: ExcessOffDayAggregatorService,
    private readonly shortNoticeLeaveDeductions: ShortNoticeLeaveAggregatorService,
    private readonly breakDeductions: BreakDeductionAggregatorService,
    private readonly consecutiveLeavePenalties: ConsecutiveLeavePenaltyAggregatorService,
    private readonly mealEligibleDays: MealEligibleDaysService,
    private readonly usedOffDays: UsedOffDaysService,
    private readonly audit: AuditService,
    private readonly manualItems: ManualPayrollItemService,
    @Inject(SHARED_PAYROLL_SERVICE)
    private readonly sharedPayroll: SharedPayrollService,
  ) {}

  async buildPreview(actor: ActorContext, cycleId: string): Promise<PayrollBuilderPreviewResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    const employees = await this.listEligibleEmployees(cycle);
    const globalWarnings: string[] = [];

    const rows: PayrollBuilderEmployeePreview[] = [];
    for (const employee of employees) {
      const computed = await this.computeEmployee(cycle, employee);
      rows.push(this.toEmployeePreview(employee, computed));
      globalWarnings.push(...computed.warnings.map((w) => `${employee.globalId}: ${w}`));
    }

    return {
      cycleId: cycle.id,
      companyId: cycle.companyId,
      periodStart: cycle.periodStart.toISOString().slice(0, 10),
      periodEnd: cycle.periodEnd.toISOString().slice(0, 10),
      payDate: cycle.toPersistence().payDate.toISOString().slice(0, 10),
      status: cycle.status,
      totals: this.aggregateTotals(rows),
      employees: rows,
      warnings: globalWarnings,
    };
  }

  /** Add or refresh payroll lines for one employee in every open cycle for their company. */
  async syncEmployeeInOpenCycles(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<{ cyclesSynced: number; warnings: string[] }> {
    const openCycles = await this.prisma.payrollCycle.findMany({
      where: { companyId, deletedAt: null, status: 'open' },
      select: { id: true },
    });
    const warnings: string[] = [];
    let cyclesSynced = 0;
    for (const { id } of openCycles) {
      try {
        await this.buildCycle(actor, id, [employeeId], { skipManualApply: true });
        cyclesSynced++;
      } catch (err) {
        const message = (err as Error).message;
        warnings.push(`cycle ${id}: ${message}`);
        this.logger.warn(`Payroll sync failed for employee ${employeeId} in cycle ${id}: ${message}`);
      }
    }
    if (openCycles.length > 0 && cyclesSynced === 0) {
      throw new Error(warnings.join('; ') || 'Payroll sync failed for all open cycles');
    }
    return { cyclesSynced, warnings };
  }

  async buildCycle(
    actor: ActorContext,
    cycleId: string,
    onlyEmployeeIds?: string[],
    options?: { skipManualApply?: boolean; skipSharedPropagation?: boolean },
  ): Promise<PayrollBuilderResultResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    this.assertBuildable(cycle);

    await this.sharedPayroll.reconcileSharedSalariesForCompany(actor, cycle.companyId, cycle.periodStart);

    const manualApply = options?.skipManualApply
      ? { itemsCreated: 0, itemsSkipped: 0, definitionIds: [] as string[] }
      : await this.manualItems.applyForCycle(actor, cycleId);

    let employees = await this.listEligibleEmployees(cycle);
    if (onlyEmployeeIds?.length) {
      const allowed = new Set(onlyEmployeeIds);
      employees = employees.filter((row) => allowed.has(row.id));
    }
    const depositRules = await this.depositSettings.getRules(cycle.companyId);

    let itemsCreated = manualApply.itemsCreated;
    let itemsUpdated = 0;
    let itemsSkipped = manualApply.itemsSkipped;
    const warnings: string[] = [];
    if (manualApply.itemsCreated > 0) {
      warnings.push(`Applied ${manualApply.itemsCreated} scheduled manual payroll item(s)`);
    }
    const totalsByItemType: Record<string, number> = {};

    for (const employee of employees) {
      const computed = await this.computeEmployee(cycle, employee);
      warnings.push(...computed.warnings.map((w) => `${employee.globalId}: ${w}`));

      await this.syncApprovedOvertime(cycle, employee.id, actor.userId);

      const otLinked = await this.sumExistingItems(cycle.id, employee.id, ['ot']);
      computed.overtime = otLinked;

      if (computed.salary > 0) {
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'salary',
          amount: computed.salary,
          quantity: computed.salaryQuantity,
          sourceRefType: null,
          sourceRefId: null,
          note: builderNote(`คิดตามจำนวนวันในรอบนี้ (${computed.salaryQuantity ?? 0} วัน)`),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'salary', computed.salary, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      } else if (computed.warnings.some((w) => w.includes('salary history'))) {
        itemsSkipped++;
      }

      if (computed.mealAllowance > 0) {
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'meal_allowance',
          amount: computed.mealAllowance,
          quantity: computed.mealEligibleDays,
          sourceRefType: null,
          sourceRefId: null,
          note: builderNote(
            `ค่าอาหาร ${computed.mealEligibleDays} วัน × ${computed.mealRatePerDay} บาท`
            + ` | ออฟฟิศ ${computed.officeDays} วัน · WFH ${computed.wfhDays} วัน`,
          ),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'meal_allowance', computed.mealAllowance, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      } else {
        const removed = await this.removeBuilderItem(cycle.id, employee.id, 'meal_allowance', actor.userId);
        if (removed) itemsUpdated++;
      }

      if (computed.crossBorderAllowance > 0) {
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'cross_border',
          amount: computed.crossBorderAllowance,
          quantity: computed.officeDays,
          sourceRefType: null,
          sourceRefId: null,
          note: builderNote(
            `ค่าข้าม ${computed.officeDays} วันออฟฟิศ × ${computed.crossBorderRatePerDay} บาท`
            + ` | WFH ${computed.wfhDays} วัน (ไม่ได้ค่าข้าม)`,
          ),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'cross_border', computed.crossBorderAllowance, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      } else {
        const removed = await this.removeBuilderItem(cycle.id, employee.id, 'cross_border', actor.userId);
        if (removed) itemsUpdated++;
      }

      if (computed.lateDeduction > 0) {
        const firstSource = computed.lateDeductionSources.sources[0];
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'late_deduction',
          amount: -computed.lateDeduction,
          quantity: computed.lateDeductionSources.sources.length,
          sourceRefType: 'attendance',
          sourceRefId: firstSource?.attendanceRecordId ?? null,
          note: builderNote(formatLateDeductionNote(computed.lateDeductionSources)),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'late_deduction', -computed.lateDeduction, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      }

      if (computed.absenceDeduction > 0) {
        const firstSource = computed.absenceDeductionSources.sources[0];
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'absence_deduction',
          amount: -computed.absenceDeduction,
          quantity: computed.absenceDeductionSources.sources.length,
          sourceRefType: 'absence_record',
          sourceRefId: firstSource?.absenceRecordId ?? null,
          note: builderNote(formatAbsenceDeductionNote(computed.absenceDeductionSources)),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'absence_deduction', -computed.absenceDeduction, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
        if (outcome !== 'skipped') {
          const item = await this.prisma.payrollItem.findFirst({
            where: {
              payrollCycleId: cycle.id,
              employeeId: employee.id,
              itemType: 'absence_deduction',
              deletedAt: null,
            },
          });
          if (item) {
            await this.absenceDeductions.linkRecordsToPayrollItem(
              computed.absenceDeductionSources.sources.map((s) => s.absenceRecordId),
              item.id,
            );
          }
        }
      }

      if (computed.excessOffDeduction > 0) {
        const firstSource = computed.excessOffDeductionSources.sources[0];
        const leaveShortNote = computed.shortNoticeLeaveDeductionSources.sources.length
          ? formatShortNoticeLeaveDeductionNote(computed.shortNoticeLeaveDeductionSources)
          : '';
        const offNote = computed.excessOffDeductionSources.sources.length
          ? formatExcessOffDayDeductionNote(computed.excessOffDeductionSources)
          : '';
        const note = [offNote, leaveShortNote].filter(Boolean).join(' | ');
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'excess_off_deduction',
          amount: -computed.excessOffDeduction,
          quantity:
            computed.excessOffDeductionSources.sources.length
            + computed.shortNoticeLeaveDeductionSources.sources.length,
          sourceRefType: null,
          sourceRefId: firstSource?.monthlyOffRequestId
            ?? computed.shortNoticeLeaveDeductionSources.sources[0]?.leaveRequestId
            ?? null,
          note: builderNote(note || 'หักแจ้งไม่ครบ 7 วัน / วันหยุดเกินโควต้า'),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'excess_off_deduction', -computed.excessOffDeduction, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      }

      if (computed.breakDeduction > 0) {
        const firstSource = computed.breakDeductionSources.sources[0];
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'break_deduction',
          amount: -computed.breakDeduction,
          quantity: computed.breakDeductionSources.sources.length,
          sourceRefType: 'attendance',
          sourceRefId: firstSource?.attendanceRecordId ?? null,
          note: builderNote(formatBreakDeductionNote(computed.breakDeductionSources)),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'break_deduction', -computed.breakDeduction, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      }

      if (computed.consecutiveLeaveDeduction > 0) {
        const firstSource = computed.consecutiveLeaveDeductionSources.sources[0];
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'consecutive_leave_deduction',
          amount: -computed.consecutiveLeaveDeduction,
          quantity: computed.consecutiveLeaveDeductionSources.sources.length,
          sourceRefType: null,
          sourceRefId: firstSource?.leaveRequestId ?? null,
          note: builderNote(formatConsecutiveLeavePenaltyNote(computed.consecutiveLeaveDeductionSources)),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'consecutive_leave_deduction', -computed.consecutiveLeaveDeduction, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      }

      if (computed.leaveBonus > 0) {
        const outcome = await this.upsertBuilderItem({
          cycle,
          employeeId: employee.id,
          itemType: 'leave_bonus',
          amount: computed.leaveBonus,
          quantity: computed.leaveBonusDays,
          sourceRefType: 'leave_bonus',
          sourceRefId: null,
          note: builderNote(
            `โบนัสจากวันหยุดที่ยังไม่ได้ใช้ ${computed.leaveBonusDays} วัน × ${computed.leaveBonusRatePerDay} บาท`
            + (computed.offEntitlementNote ? ` | ${computed.offEntitlementNote}` : ' | คิดตามเพดานปกติ'),
          ),
          actorUserId: actor.userId,
        });
        this.trackOutcome(outcome, 'leave_bonus', computed.leaveBonus, totalsByItemType, {
          created: () => { itemsCreated++; },
          updated: () => { itemsUpdated++; },
          skipped: () => { itemsSkipped++; },
        });
      }

      if (depositRules.enabled && computed.deposit > 0) {
        const outcome = await this.upsertDeposit(cycle, employee.id, depositRules, computed.deposit, actor.userId);
        if (outcome === 'created') {
          itemsCreated++;
          totalsByItemType.deposit = (totalsByItemType.deposit ?? 0) - computed.deposit;
        } else if (outcome === 'updated') {
          itemsUpdated++;
          totalsByItemType.deposit = (totalsByItemType.deposit ?? 0) - computed.deposit;
        } else {
          itemsSkipped++;
        }
      }
    }

    if (!options?.skipSharedPropagation) {
      const sharedEmployeeIds = employees
        .filter((row) => row.payrollAllocationMode === 'shared_across_companies')
        .map((row) => row.id);
      if (sharedEmployeeIds.length > 0) {
        const propagated = await this.propagateSharedPayrollBuild(actor, cycle, sharedEmployeeIds);
        itemsCreated += propagated.itemsCreated;
        itemsUpdated += propagated.itemsUpdated;
        warnings.push(...propagated.warnings);
      }
    }

    await this.audit.record(actor, {
      entityType: 'PayrollCycle',
      entityId: cycleId,
      action: 'build',
      after: {
        employeesProcessed: employees.length,
        itemsCreated,
        itemsUpdated,
        itemsSkipped,
        totalsByItemType,
      },
    });

    this.logger.log(
      `Built payroll cycle ${cycleId}: ${employees.length} employees, `
      + `${itemsCreated} created, ${itemsUpdated} updated, ${itemsSkipped} skipped`,
    );

    return {
      cycleId,
      employeesProcessed: employees.length,
      itemsCreated,
      itemsUpdated,
      itemsSkipped,
      totalsByItemType,
      warnings,
    };
  }

  /** Mirror shared-payroll lines into sibling open cycles (same period, other companies). */
  private async propagateSharedPayrollBuild(
    actor: ActorContext,
    sourceCycle: PayrollCycle,
    employeeIds: string[],
  ): Promise<{ itemsCreated: number; itemsUpdated: number; warnings: string[] }> {
    const siblingCycles = await this.prisma.payrollCycle.findMany({
      where: {
        companyId: { not: sourceCycle.companyId },
        deletedAt: null,
        status: 'open',
        periodStart: sourceCycle.periodStart,
        periodEnd: sourceCycle.periodEnd,
      },
      select: { id: true, companyId: true },
    });
    if (!siblingCycles.length) {
      return { itemsCreated: 0, itemsUpdated: 0, warnings: [] };
    }

    let itemsCreated = 0;
    let itemsUpdated = 0;
    const warnings: string[] = [];

    for (const sibling of siblingCycles) {
      for (const employeeId of employeeIds) {
        const hasAssignment = await this.prisma.employeeAssignment.count({
          where: {
            employeeId,
            companyId: sibling.companyId,
            deletedAt: null,
            effectiveFrom: { lte: sourceCycle.periodEnd },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: sourceCycle.periodStart } },
            ],
          },
        });
        if (!hasAssignment) continue;

        try {
          const result = await this.buildCycle(actor, sibling.id, [employeeId], {
            skipManualApply: true,
            skipSharedPropagation: true,
          });
          itemsCreated += result.itemsCreated;
          itemsUpdated += result.itemsUpdated;
          warnings.push(...result.warnings);
        } catch (err) {
          warnings.push(`shared sync ${sibling.companyId}: ${(err as Error).message}`);
        }
      }
    }

    return { itemsCreated, itemsUpdated, warnings };
  }

  private async computeEmployee(cycle: PayrollCycle, employee: EligibleEmployee): Promise<EmployeeComputed> {
    const warnings: string[] = [];
    const alloc = await this.sharedPayroll.getAllocationForEmployee(employee.id);
    const isShared = this.sharedPayroll.isSharedAllocation(alloc);

    let salary = 0;
    let salaryQuantity: number | null = null;
    let salaryMonthlyBase: number | null = null;
    let salaryDays = 0;
    let salaryPeriodDays = 0;
    let bands = await this.salaries.getBandsInPeriod(
      employee.id, cycle.companyId, cycle.periodStart, cycle.periodEnd,
    );
    bands = clampSalaryBandsToHireDate(
      bands,
      employee.hireDate,
      cycle.periodStart,
      cycle.periodEnd,
    );
    if (!bands.length) {
      warnings.push('No salary history for this cycle — salary skipped');
    } else {
      const result = this.prorate.compute({
        periodStart: cycle.periodStart,
        periodEnd: cycle.periodEnd,
        bands,
      });
      salary = result.earnedAmount;
      salaryQuantity = result.totalDays;
      salaryPeriodDays = result.totalDays;
      salaryDays = result.bands.reduce((sum, band) => sum + band.days, 0);
      if (bands.length === 1) salaryMonthlyBase = bands[0].monthlySalary;
    }

    const payrollRules = await this.payrollSettings.getRules(cycle.companyId);
    const eligibility = await this.mealEligibleDays.countEligibleDays(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );
    const meal = computeMealAllowance(
      { ratePerDay: payrollRules.mealAllowancePerDay },
      { eligibleDays: eligibility.eligibleDays },
    );
    const crossBorderRatePerDay = Math.max(0, payrollRules.crossBorderAllowancePerDay);
    let crossBorderAllowance = Math.round(crossBorderRatePerDay * eligibility.officeDays * 100) / 100;
    let mealAllowance = meal.amount;
    let mealEligibleDays = meal.eligibleDays;
    let officeDays = eligibility.officeDays;
    let wfhDays = eligibility.wfhDays;

    const lateSummary = await this.lateDeductions.aggregateForPeriod(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );

    const absenceSummary = await this.absenceDeductions.aggregateForPeriod(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
      cycle.id,
    );

    const excessOffSummary = await this.excessOffDeductions.aggregateForPeriod(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );

    const shortNoticeLeaveSummary = await this.shortNoticeLeaveDeductions.aggregateForPeriod(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );

    const breakSummary = await this.breakDeductions.aggregateForPeriod(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );

    const consecutiveLeaveSummary = await this.consecutiveLeavePenalties.aggregateForPeriod(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );

    const leaveRules = await this.leaveSettings.getRules(cycle.companyId);
    const offEntitlement = computeMonthlyOffEntitlement({
      monthlyOffDays: leaveRules.monthlyOffDays,
      periodStartIso: cycle.periodStart.toISOString().slice(0, 10),
      periodEndIso: cycle.periodEnd.toISOString().slice(0, 10),
      hireDate: employee.hireDate,
      terminationDate: employee.terminationDate,
    });
    const leaveParams = toLeaveBonusParams(leaveRules, offEntitlement.entitledOffDays);
    const usedOffDays = await this.usedOffDays.countUsedOffDays(
      employee.id,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );
    const leaveBonusResult = computeLeaveBonus(leaveParams, { usedOffDays, overrideApproved: false });
    const offEntitlementNote = offEntitlement.prorated
      ? `off allowance prorated ${offEntitlement.entitledOffDays}/${offEntitlement.fullMonthlyOffDays}`
        + ` (worked ${offEntitlement.eligibleEmploymentDays}/${offEntitlement.periodDays} days)`
      : null;

    let lateDeduction = lateSummary.totalDeduction;
    let absenceDeduction = absenceSummary.totalDeduction;
    let excessOffDeduction = excessOffSummary.totalDeduction + shortNoticeLeaveSummary.totalDeduction;
    let breakDeduction = breakSummary.totalDeduction;
    let consecutiveLeaveDeduction = consecutiveLeaveSummary.totalDeduction;
    let leaveBonus = leaveBonusResult.bonusAmount;
    let leaveBonusDays = leaveBonusResult.eligibleBonusDays;
    let leaveBonusRatePerDay = leaveBonusResult.ratePerDay;

    if (isShared) {
      const n = alloc.companyCount;
      const mealAgg = await this.sharedPayroll.aggregateMealAcrossCompanies(
        employee.id, cycle.periodStart, cycle.periodEnd,
      );
      mealAllowance = this.sharedPayroll.allocateCompanyShare(mealAgg.totalAmount, n);
      mealEligibleDays = mealAgg.eligibleDays;
      officeDays = mealAgg.officeDays;
      wfhDays = mealAgg.wfhDays;

      const crossAgg = await this.sharedPayroll.aggregateCrossBorderAcrossCompanies(
        employee.id, cycle.periodStart, cycle.periodEnd,
      );
      crossBorderAllowance = this.sharedPayroll.allocateCompanyShare(crossAgg.totalAmount, n);

      const bonusAgg = await this.sharedPayroll.aggregateLeaveBonusAcrossCompanies(
        employee, cycle.periodStart, cycle.periodEnd,
      );
      leaveBonus = this.sharedPayroll.allocateCompanyShare(bonusAgg.totalBonus, n);
      leaveBonusDays = bonusAgg.bonusDays;
      leaveBonusRatePerDay = bonusAgg.ratePerDay;

      const dedAgg = await this.sharedPayroll.aggregateDeductionsAcrossCompanies(
        employee.id, cycle.periodStart, cycle.periodEnd, cycle.id,
      );
      lateDeduction = this.sharedPayroll.allocateCompanyShare(dedAgg.late, n);
      absenceDeduction = this.sharedPayroll.allocateCompanyShare(dedAgg.absence, n);
      excessOffDeduction = this.sharedPayroll.allocateCompanyShare(
        dedAgg.excessOff + dedAgg.shortNotice, n,
      );
      breakDeduction = this.sharedPayroll.allocateCompanyShare(dedAgg.breakDeduction, n);
      consecutiveLeaveDeduction = this.sharedPayroll.allocateCompanyShare(dedAgg.consecutiveLeave, n);
    }

    const overtime = await this.sumExistingItems(cycle.id, employee.id, ['ot']);
    const pendingOt = await this.sumPendingApprovedOvertime(cycle, employee.id);
    const commission = await this.sumCommissionItems(cycle.id, employee.id);
    let manualAdjustments = await this.sumManualAdjustments(cycle.id, employee.id);

    if (isShared) {
      const manualTotal = await this.sharedPayroll.aggregateManualAdjustmentsAcrossCompanies(
        employee.id, cycle.periodStart, cycle.periodEnd,
      );
      manualAdjustments = this.sharedPayroll.allocateCompanyShare(manualTotal, alloc.companyCount);
    }

    const depositRules = await this.depositSettings.getRules(cycle.companyId);
    const credits =
      salary
      + mealAllowance
      + crossBorderAllowance
      + leaveBonus
      + (overtime + pendingOt)
      + commission
      + manualAdjustments;
    const nonDepositDeductions =
      lateDeduction
      + absenceDeduction
      + excessOffDeduction
      + breakDeduction
      + consecutiveLeaveDeduction;
    const netBeforeDeposit = roundMoney(credits - nonDepositDeductions);

    let deposit = 0;
    let depositDeferred = false;
    const isSharedDeposit =
      employee.payrollAllocationMode === 'shared_across_companies'
      && employee.depositCollectionCompanyId != null;
    const depositLedgerCompanyId = isSharedDeposit
      ? employee.depositCollectionCompanyId!
      : cycle.companyId;
    const shouldCollectDepositHere = !isSharedDeposit
      || cycle.companyId === employee.depositCollectionCompanyId;

    if (depositRules.enabled && !employee.depositDeductionExempt && shouldCollectDepositHere) {
      const running = await this.deposits.getRunningTotal(employee.id, depositLedgerCompanyId);
      if (running >= depositRules.maximumBalanceAmount) {
        warnings.push(
          `เงินประกันครบเพดานแล้ว (${depositRules.maximumBalanceAmount} บาท) — ไม่หักรายเดือน`,
        );
      } else if (running + depositRules.monthlyDeductionAmount > depositRules.maximumBalanceAmount) {
        warnings.push(
          `เงินประกันใกล้ครบเพดาน (${depositRules.maximumBalanceAmount} บาท) — ข้ามการหักรอบนี้`,
        );
      } else {
        const proposed = depositRules.monthlyDeductionAmount;
        const deferral = shouldDeferDeposit({
          netPayBeforeDeposit: netBeforeDeposit,
          depositAmount: proposed,
          minimumNetPayAfterDeposit: depositRules.minimumNetPayAfterDeposit,
        });
        if (deferral.defer) {
          depositDeferred = true;
          if (deferral.reason) warnings.push(deferral.reason);
        } else {
          deposit = proposed;
        }
      }
    }

    return {
      salary,
      mealAllowance,
      crossBorderAllowance,
      officeDays,
      wfhDays,
      lateDeduction,
      absenceDeduction,
      excessOffDeduction,
      breakDeduction,
      consecutiveLeaveDeduction,
      leaveBonus,
      overtime: overtime + pendingOt,
      commission,
      manualAdjustments,
      deposit,
      depositDeferred,
      warnings,
      salaryQuantity,
      salaryMonthlyBase,
      salaryDays,
      salaryPeriodDays,
      mealEligibleDays,
      mealRatePerDay: meal.ratePerDay,
      crossBorderRatePerDay,
      leaveBonusDays,
      leaveBonusRatePerDay,
      offEntitlementNote,
      lateDeductionSources: lateSummary,
      absenceDeductionSources: absenceSummary,
      excessOffDeductionSources: excessOffSummary,
      shortNoticeLeaveDeductionSources: shortNoticeLeaveSummary,
      breakDeductionSources: breakSummary,
      consecutiveLeaveDeductionSources: consecutiveLeaveSummary,
    };
  }

  private toEmployeePreview(
    employee: EligibleEmployee,
    computed: EmployeeComputed,
  ): PayrollBuilderEmployeePreview {
    const credits =
      computed.salary
      + computed.mealAllowance
      + computed.crossBorderAllowance
      + computed.leaveBonus
      + computed.overtime
      + computed.commission
      + computed.manualAdjustments;
    const deductions =
      computed.lateDeduction
      + computed.absenceDeduction
      + computed.excessOffDeduction
      + computed.breakDeduction
      + computed.consecutiveLeaveDeduction
      + computed.deposit;
    return {
      employeeId: employee.id,
      globalId: employee.globalId,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      workCategory: employee.workCategory,
      officeDays: computed.officeDays,
      wfhDays: computed.wfhDays,
      salary: computed.salary,
      mealAllowance: computed.mealAllowance,
      crossBorderAllowance: computed.crossBorderAllowance,
      lateDeduction: computed.lateDeduction,
      absenceDeduction: computed.absenceDeduction,
      leaveBonus: computed.leaveBonus,
      overtime: computed.overtime,
      commission: computed.commission,
      manualAdjustments: computed.manualAdjustments,
      deposit: computed.deposit,
      depositDeferred: computed.depositDeferred,
      gross: roundMoney(credits),
      deductions: roundMoney(deductions),
      net: roundMoney(credits - deductions),
      salaryMonthlyBase: computed.salaryMonthlyBase,
      salaryDays: computed.salaryDays,
      salaryPeriodDays: computed.salaryPeriodDays,
      mealEligibleDays: computed.mealEligibleDays,
      crossBorderEligibleDays: computed.officeDays,
      warnings: computed.warnings,
      payrollAllocationMode: employee.payrollAllocationMode,
    };
  }

  private aggregateTotals(rows: PayrollBuilderEmployeePreview[]): PayrollBuilderPreviewTotals {
    const totals = rows.reduce(
      (acc, row) => {
        acc.totalBaseSalary += row.salary;
        acc.totalMealAllowance += row.mealAllowance;
        acc.totalCrossBorderAllowance += row.crossBorderAllowance;
        acc.totalLateDeductions += row.lateDeduction;
        acc.totalAbsenceDeductions += row.absenceDeduction;
        acc.totalLeaveBonus += row.leaveBonus;
        acc.totalOvertime += row.overtime;
        acc.totalCommission += row.commission;
        acc.totalManualAdjustments += row.manualAdjustments;
        acc.totalDepositDeduction += row.deposit;
        acc.estimatedGross += row.gross;
        acc.estimatedDeductions += row.deductions;
        acc.estimatedNet += row.net;
        return acc;
      },
      {
        employeeCount: rows.length,
        totalBaseSalary: 0,
        totalMealAllowance: 0,
        totalCrossBorderAllowance: 0,
        totalLateDeductions: 0,
        totalAbsenceDeductions: 0,
        totalLeaveBonus: 0,
        totalOvertime: 0,
        totalCommission: 0,
        totalManualAdjustments: 0,
        totalDepositDeduction: 0,
        estimatedGross: 0,
        estimatedDeductions: 0,
        estimatedNet: 0,
      },
    );
    return {
      ...totals,
      totalBaseSalary: roundMoney(totals.totalBaseSalary),
      totalMealAllowance: roundMoney(totals.totalMealAllowance),
      totalLateDeductions: roundMoney(totals.totalLateDeductions),
      totalAbsenceDeductions: roundMoney(totals.totalAbsenceDeductions),
      totalLeaveBonus: roundMoney(totals.totalLeaveBonus),
      totalOvertime: roundMoney(totals.totalOvertime),
      totalCommission: roundMoney(totals.totalCommission),
      totalManualAdjustments: roundMoney(totals.totalManualAdjustments),
      totalDepositDeduction: roundMoney(totals.totalDepositDeduction),
      estimatedGross: roundMoney(totals.estimatedGross),
      estimatedDeductions: roundMoney(totals.estimatedDeductions),
      estimatedNet: roundMoney(totals.estimatedNet),
    };
  }

  private async listEligibleEmployees(cycle: PayrollCycle): Promise<EligibleEmployee[]> {
    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        OR: [
          { terminationDate: null },
          { terminationDate: { gte: cycle.periodStart } },
        ],
        assignments: {
          some: {
            companyId: cycle.companyId,
            deletedAt: null,
            effectiveFrom: { lte: cycle.periodEnd },
            OR: [
              { effectiveTo: null },
              { effectiveTo: { gte: cycle.periodStart } },
            ],
          },
        },
      },
      select: {
        id: true,
        globalId: true,
        firstName: true,
        lastName: true,
        workCategory: true,
        hireDate: true,
        terminationDate: true,
        depositDeductionExempt: true,
        depositCollectionCompanyId: true,
        payrollAllocationMode: true,
      },
      orderBy: { globalId: 'asc' },
    });

    return rows.map((row) => ({
      id: row.id,
      globalId: row.globalId,
      firstName: row.firstName,
      lastName: row.lastName,
      workCategory: (row.workCategory ?? 'office') as 'office' | 'wfh',
      hireDate: row.hireDate,
      terminationDate: row.terminationDate,
      depositDeductionExempt: row.depositDeductionExempt,
      depositCollectionCompanyId: row.depositCollectionCompanyId,
      payrollAllocationMode: row.payrollAllocationMode as 'standard' | 'shared_across_companies',
    }));
  }

  private async syncApprovedOvertime(
    cycle: PayrollCycle,
    employeeId: string,
    actorUserId: string,
  ): Promise<void> {
    const records = await this.prisma.overtimeRecord.findMany({
      where: {
        employeeId,
        companyId: cycle.companyId,
        status: 'approved',
        payrollItemId: null,
        workDate: { gte: cycle.periodStart, lte: cycle.periodEnd },
        deletedAt: null,
      },
    });

    for (const ot of records) {
      const itemId = randomUUID();
      await this.prisma.$transaction(async (tx) => {
        await tx.payrollItem.create({
          data: {
            id: itemId,
            payrollCycleId: cycle.id,
            employeeId: ot.employeeId,
            companyId: ot.companyId,
            itemType: 'ot',
            amount: ot.amount,
            quantity: ot.otHours,
            sourceRefType: 'overtime',
            sourceRefId: ot.id,
            note: builderNote(`OT ที่อนุมัติแล้ว (${ot.workDate.toISOString().slice(0, 10)})`),
            createdBy: actorUserId,
            updatedBy: actorUserId,
          },
        });
        await tx.overtimeRecord.update({
          where: { id: ot.id },
          data: { payrollItemId: itemId, updatedBy: actorUserId },
        });
      });
    }
  }

  private async sumExistingItems(
    cycleId: string,
    employeeId: string,
    itemTypes: PayrollItemRow['itemType'][],
  ): Promise<number> {
    const rows = await this.prisma.payrollItem.findMany({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        itemType: { in: itemTypes },
        deletedAt: null,
      },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  }

  private async sumPendingApprovedOvertime(cycle: PayrollCycle, employeeId: string): Promise<number> {
    const rows = await this.prisma.overtimeRecord.findMany({
      where: {
        employeeId,
        companyId: cycle.companyId,
        status: 'approved',
        payrollItemId: null,
        workDate: { gte: cycle.periodStart, lte: cycle.periodEnd },
        deletedAt: null,
      },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  }

  private async sumCommissionItems(cycleId: string, employeeId: string): Promise<number> {
    const rows = await this.prisma.payrollItem.findMany({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        deletedAt: null,
        OR: [
          { itemType: { in: [...COMMISSION_ITEM_TYPES] } },
          { sourceRefType: { in: [...COMMISSION_SOURCE_REF_TYPES] } },
        ],
      },
    });
    return roundMoney(rows.reduce((sum, row) => sum + Number(row.amount), 0));
  }

  private async sumManualAdjustments(cycleId: string, employeeId: string): Promise<number> {
    const rows = await this.prisma.payrollItem.findMany({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        itemType: { in: [...MANUAL_ADJUSTMENT_ITEM_TYPES] },
        deletedAt: null,
      },
    });
    return roundMoney(
      rows
        .filter((row) => !isBuilderGeneratedNote(row.note))
        .reduce((sum, row) => sum + Number(row.amount), 0),
    );
  }

  /** Soft-delete a builder-managed item when the computed amount is zero. */
  private async removeBuilderItem(
    cycleId: string,
    employeeId: string,
    itemType: PayrollItemRow['itemType'],
    actorUserId: string,
  ): Promise<boolean> {
    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        itemType,
        deletedAt: null,
      },
    });
    if (!existing || !isBuilderGeneratedNote(existing.note)) return false;
    await this.prisma.payrollItem.update({
      where: { id: existing.id },
      data: { deletedAt: new Date(), updatedBy: actorUserId },
    });
    return true;
  }

  private async upsertBuilderItem(input: {
    cycle: PayrollCycle;
    employeeId: string;
    itemType: PayrollItemRow['itemType'];
    amount: number;
    quantity: number | null;
    sourceRefType: PayrollItemRow['sourceRefType'];
    sourceRefId: string | null;
    note: string;
    actorUserId: string;
  }): Promise<UpsertOutcome> {
    if (!BUILDER_MANAGED_ITEM_TYPES.includes(input.itemType as typeof BUILDER_MANAGED_ITEM_TYPES[number])) {
      throw new Error(`Item type ${input.itemType} is not builder-managed`);
    }

    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: input.cycle.id,
        employeeId: input.employeeId,
        itemType: input.itemType,
        deletedAt: null,
      },
    });

    if (existing && !isBuilderGeneratedNote(existing.note)) {
      return 'skipped';
    }

    if (existing) {
      await this.prisma.payrollItem.update({
        where: { id: existing.id },
        data: {
          amount: new Prisma.Decimal(input.amount),
          quantity: input.quantity != null ? new Prisma.Decimal(input.quantity) : null,
          sourceRefType: (input.sourceRefType ?? undefined) as never,
          sourceRefId: input.sourceRefId ?? undefined,
          note: input.note,
          updatedBy: input.actorUserId,
        },
      });
      return 'updated';
    }

    await this.items.create({
      payrollCycleId: input.cycle.id,
      employeeId: input.employeeId,
      companyId: input.cycle.companyId,
      itemType: input.itemType,
      amount: input.amount,
      quantity: input.quantity,
      sourceRefType: input.sourceRefType,
      sourceRefId: input.sourceRefId,
      note: input.note,
    }, input.actorUserId);
    return 'created';
  }

  private async upsertDeposit(
    cycle: PayrollCycle,
    employeeId: string,
    depositRules: Awaited<ReturnType<DepositSettingsService['getRules']>>,
    amount: number,
    actorUserId: string,
  ): Promise<UpsertOutcome> {
    const itemType = depositRules.deductionItemType as PayrollItemRow['itemType'];
    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycle.id,
        employeeId,
        itemType,
        deletedAt: null,
      },
    });

    if (existing && !isBuilderGeneratedNote(existing.note)) {
      return 'skipped';
    }

    const note = builderNote('หักประกันรายเดือน');
    const negativeAmount = -amount;

    if (existing) {
      await this.prisma.payrollItem.update({
        where: { id: existing.id },
        data: {
          amount: new Prisma.Decimal(negativeAmount),
          quantity: new Prisma.Decimal(1),
          note,
          updatedBy: actorUserId,
        },
      });
      return 'updated';
    }

    const running = await this.deposits.getRunningTotal(employeeId, cycle.companyId);
    if (running >= depositRules.maximumBalanceAmount
      || running + amount > depositRules.maximumBalanceAmount) {
      throw new DepositCapExceededError(depositRules.maximumBalanceAmount);
    }

    await this.items.create({
      payrollCycleId: cycle.id,
      employeeId,
      companyId: cycle.companyId,
      itemType,
      amount: negativeAmount,
      quantity: 1,
      sourceRefType: 'deposit',
      sourceRefId: null,
      note,
    }, actorUserId);

    await this.deposits.create({
      employeeId,
      companyId: cycle.companyId,
      cycleId: cycle.id,
      amount,
    }, actorUserId);

    return 'created';
  }

  private trackOutcome(
    outcome: UpsertOutcome,
    itemType: string,
    amount: number,
    totalsByItemType: Record<string, number>,
    counters: Record<UpsertOutcome, () => void>,
  ): void {
    counters[outcome]();
    if (outcome !== 'skipped') {
      totalsByItemType[itemType] = roundMoney((totalsByItemType[itemType] ?? 0) + amount);
    }
  }

  private assertBuildable(cycle: PayrollCycle): void {
    if (cycle.status === 'paid') throw new PayrollCyclePaidError();
    if (cycle.status === 'locked') throw new PayrollCycleLockedError();
  }

  private async getCycleOrThrow(actor: ActorContext, id: string): Promise<PayrollCycle> {
    const cycle = await this.cycles.findById(id);
    if (!cycle) throw new PayrollCycleNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, cycle.companyId);
    return cycle;
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
