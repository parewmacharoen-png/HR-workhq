// ============================================================================
// modules/payroll/application/payroll.service.ts
// Controls the payroll lifecycle:
//   open → add items (salary/prorate, OT, allowances, deposit, adjustments)
//       → lock → generate payslips → mark paid.
// Salary is prorated when a band change falls mid-cycle. Deposit is capped at
// 3,000 THB and owned by the collecting company (non-transferable by spec).
// Meal allowance rate comes from payroll settings; eligible days are computed automatically.
// Leave bonus is computed automatically from approved off-day usage (see addLeaveBonus).
// Late deductions are read from stored attendance records (see addLateDeduction).
// ============================================================================

import { Inject, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  PAYROLL_CYCLE_REPOSITORY, PAYROLL_ITEM_REPOSITORY,
  PAYSLIP_REPOSITORY, SALARY_REPOSITORY, DEPOSIT_REPOSITORY,
  PayrollCycleRepository, PayrollItemRepository,
  PayslipRepository, SalaryRepository, DepositRepository,
  PayrollItemRow,
} from '../domain/repositories/payroll.repository';
import { PayrollCycle } from '../domain/entities/payroll-cycle.entity';
import { ProrateService } from '../domain/services/prorate.service';
import { clampSalaryBandsToHireDate } from '../domain/services/salary-band-employment.util';
import {
  PayrollCycleNotFoundError, PayrollCycleAlreadyExistsError,
  DepositCapExceededError, DepositDisabledError,
  PayslipNotFoundError, PayslipNotReadyError, PayrollItemNotFoundError,
  LeaveBonusAlreadyExistsError, LeaveBonusOverrideNotAllowedError,
  LateDeductionAlreadyExistsError, MealAllowanceAlreadyExistsError,
  AbsenceDeductionAlreadyExistsError,
} from '../domain/errors/payroll.errors';
import {
  OpenPayrollCycleDto, AddPayrollItemDto, AddDepositDto, AddLeaveBonusDto,
  CycleResponse, PayslipResponse, LeaveBonusResponse,
  LateDeductionResponse, MealAllowanceResponse, AbsenceDeductionResponse,
} from './dto/payroll.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';
import { DepositSettingsService } from '../../settings/application/deposit-settings.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import { PayrollSettingsService } from '../../settings/application/payroll-settings.service';
import { SalaryVisibilityService } from '../../permission/application/salary-visibility.service';
import {
  computeLeaveBonus,
  toLeaveBonusParams,
} from '../domain/services/leave-bonus.service';
import { computeMonthlyOffEntitlement } from '../../leave/domain/services/monthly-off-entitlement.service';
import { UsedOffDaysService } from './used-off-days.service';
import { LateDeductionAggregatorService } from './late-deduction-aggregator.service';
import { AbsenceDeductionAggregatorService } from './absence-deduction-aggregator.service';
import { MealEligibleDaysService } from './meal-eligible-days.service';
import { formatLateDeductionNote } from '../domain/services/late-deduction.service';
import { formatAbsenceDeductionNote } from '../domain/services/absence-deduction.service';
import { computeMealAllowance } from '../domain/services/meal-allowance.service';
import { PayrollOverviewAssemblerService } from './payroll-overview-assembler.service';
import type { PayrollOverviewEmployeeRow } from './dto/payroll-overview.dto';
import {
  EmployeePayrollHistoryItemDto,
  EmployeePayrollHistoryStatus,
  EmployeePayrollViewDto,
} from './dto/employee-payroll-view.dto';

@Injectable()
export class PayrollService {
  private readonly logger = new Logger(PayrollService.name);
  private readonly prorate = new ProrateService();

  constructor(
    @Inject(PAYROLL_CYCLE_REPOSITORY) private readonly cycles: PayrollCycleRepository,
    @Inject(PAYROLL_ITEM_REPOSITORY)  private readonly items: PayrollItemRepository,
    @Inject(PAYSLIP_REPOSITORY)       private readonly payslips: PayslipRepository,
    @Inject(SALARY_REPOSITORY)        private readonly salaries: SalaryRepository,
    @Inject(DEPOSIT_REPOSITORY)       private readonly deposits: DepositRepository,
    private readonly audit: AuditService,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
    private readonly depositSettings: DepositSettingsService,
    private readonly leaveSettings: LeaveSettingsService,
    private readonly payrollSettings: PayrollSettingsService,
    private readonly salaryVisibility: SalaryVisibilityService,
    private readonly usedOffDays: UsedOffDaysService,
    private readonly lateDeductions: LateDeductionAggregatorService,
    private readonly absenceDeductions: AbsenceDeductionAggregatorService,
    private readonly mealEligibleDays: MealEligibleDaysService,
    private readonly overviewAssembler: PayrollOverviewAssemblerService,
  ) {}

  // ── Cycle lifecycle ──────────────────────────────────────────────────────

  async openCycle(actor: ActorContext, dto: OpenPayrollCycleDto): Promise<CycleResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const periodStart = new Date(dto.periodStart);
    if (await this.cycles.existsForCompanyPeriod(dto.companyId, periodStart)) {
      throw new PayrollCycleAlreadyExistsError();
    }
    const cycle = PayrollCycle.create({
      id: randomUUID(),
      companyId: dto.companyId,
      periodStart,
      periodEnd: new Date(dto.periodEnd),
      payDate: new Date(dto.payDate),
    });
    await this.cycles.save(cycle, actor.userId);
    await this.audit.record(actor, { entityType: 'PayrollCycle', entityId: cycle.id, action: 'open', after: cycle.toPersistence() });
    return this.toCycleResponse(cycle);
  }

  async lockCycle(actor: ActorContext, cycleId: string): Promise<CycleResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.lock();
    await this.cycles.save(cycle, actor.userId);
    await this.audit.record(actor, { entityType: 'PayrollCycle', entityId: cycleId, action: 'lock' });
    return this.toCycleResponse(cycle);
  }

  async markPaid(actor: ActorContext, cycleId: string): Promise<CycleResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.markPaid();
    await this.cycles.save(cycle, actor.userId);
    await this.audit.record(actor, { entityType: 'PayrollCycle', entityId: cycleId, action: 'mark_paid' });
    return this.toCycleResponse(cycle);
  }

  // ── Item management ──────────────────────────────────────────────────────

  /** Generic item add (OT, bonuses, adjustments, cross-border, etc.). */
  async addItem(actor: ActorContext, cycleId: string, dto: AddPayrollItemDto): Promise<{ id: string }> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    await this.employeeAccess.assertEmployeeInCompany(dto.employeeId, cycle.companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, dto.employeeId);
    const id = await this.items.create({
      payrollCycleId: cycleId,
      employeeId: dto.employeeId,
      companyId: cycle.companyId,
      itemType: dto.itemType as PayrollItemRow['itemType'],
      amount: dto.amount,
      quantity: dto.quantity ?? null,
      sourceRefType: dto.sourceRefType ?? 'manual',
      sourceRefId: dto.sourceRefId ?? null,
      note: dto.note?.trim()
        ? `manual_override | ${dto.note.trim()}`
        : 'manual_override | เพิ่มด้วยมือ',
    }, actor.userId);
    await this.invalidatePayslip(cycleId, dto.employeeId, actor.userId);
    return { id };
  }

  /**
   * Manual override of an existing payroll line. Marks the note so the cycle
   * builder will not overwrite it on the next calculate.
   */
  async updateItem(
    actor: ActorContext,
    cycleId: string,
    itemId: string,
    dto: { amount: number; note?: string },
  ): Promise<{ id: string; amount: number; note: string }> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    const item = await this.items.findById(itemId);
    if (!item || item.payrollCycleId !== cycleId) {
      throw new PayrollItemNotFoundError();
    }
    await this.employeeAccess.assertEmployeeInCompany(item.employeeId, cycle.companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, item.employeeId);

    const signedAmount = signPayrollAmount(item.itemType, item.amount, dto.amount);
    const reason = dto.note?.trim();
    const note = reason
      ? `manual_override | แก้ด้วยมือ: ${reason}`
      : `manual_override | แก้ด้วยมือ (เดิม ${item.amount})`;

    await this.items.update(itemId, { amount: signedAmount, note }, actor.userId);
    await this.invalidatePayslip(cycleId, item.employeeId, actor.userId);
    await this.audit.record(actor, {
      entityType: 'PayrollItem',
      entityId: itemId,
      action: 'manual_override',
      after: { amount: signedAmount, note, previousAmount: item.amount },
    });
    return { id: itemId, amount: signedAmount, note };
  }

  async deleteItem(actor: ActorContext, cycleId: string, itemId: string): Promise<{ id: string }> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    const item = await this.items.findById(itemId);
    if (!item || item.payrollCycleId !== cycleId) {
      throw new PayrollItemNotFoundError();
    }
    await this.employeeAccess.assertEmployeeInCompany(item.employeeId, cycle.companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, item.employeeId);
    await this.items.softDelete(itemId, actor.userId);
    await this.invalidatePayslip(cycleId, item.employeeId, actor.userId);
    await this.audit.record(actor, {
      entityType: 'PayrollItem',
      entityId: itemId,
      action: 'manual_delete',
      after: { itemType: item.itemType, amount: item.amount },
    });
    return { id: itemId };
  }

  private async invalidatePayslip(
    cycleId: string,
    employeeId: string,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.payslip.updateMany({
      where: { payrollCycleId: cycleId, employeeId, deletedAt: null },
      data: { deletedAt: new Date(), deletedBy: actorUserId },
    });
  }

  /**
   * Add prorated salary for one employee based on their salary history in the
   * cycle period. Handles mid-period changes automatically.
   */
  async addSalaryItem(actor: ActorContext, cycleId: string, employeeId: string): Promise<{ id: string; amount: number }> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);

    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { hireDate: true },
    });
    if (!employee) throw new Error(`Employee ${employeeId} not found`);

    let bands = await this.salaries.getBandsInPeriod(
      employeeId, cycle.companyId, cycle.periodStart, cycle.periodEnd,
    );
    if (!bands.length) throw new Error(`No salary history found for employee ${employeeId} in this cycle`);

    bands = clampSalaryBandsToHireDate(
      bands,
      employee.hireDate,
      cycle.periodStart,
      cycle.periodEnd,
    );

    const result = this.prorate.compute({
      periodStart: cycle.periodStart,
      periodEnd: cycle.periodEnd,
      bands,
    });

    const id = await this.items.create({
      payrollCycleId: cycleId,
      employeeId,
      companyId: cycle.companyId,
      itemType: 'salary',
      amount: result.earnedAmount,
      quantity: result.totalDays,
      sourceRefType: null,
      sourceRefId: null,
      note: `คิดตามจำนวนวันในรอบนี้ (${result.totalDays} วัน)`,
    }, actor.userId);

    return { id, amount: result.earnedAmount };
  }

  /** Add meal allowance from payroll settings × eligible days (OFFICE only). */
  async addMealAllowance(
    actor: ActorContext,
    cycleId: string,
    employeeId: string,
  ): Promise<MealAllowanceResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);

    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        itemType: 'meal_allowance',
        deletedAt: null,
      },
    });
    if (existing) throw new MealAllowanceAlreadyExistsError();

    const payrollRules = await this.payrollSettings.getRules(cycle.companyId);
    const eligibility = await this.mealEligibleDays.countEligibleDays(
      employeeId,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );

    const result = computeMealAllowance(
      { ratePerDay: payrollRules.mealAllowancePerDay },
      { eligibleDays: eligibility.eligibleDays },
    );

    if (result.amount <= 0) {
      return {
        id: null,
        workCategory: eligibility.workCategory,
        workingDays: eligibility.workingDays,
        offDayLeaveDays: eligibility.offDayLeaveDays,
        eligibleDays: result.eligibleDays,
        ratePerDay: result.ratePerDay,
        amount: 0,
        skipped: true,
      };
    }

    const noteParts = [
      `ค่าอาหาร ${result.eligibleDays} วัน × ${result.ratePerDay} บาท`,
      `ออฟฟิศ ${eligibility.officeDays} วัน`,
      `WFH ${eligibility.wfhDays} วัน`,
      `วันหยุดที่อนุมัติแล้ว ${eligibility.offDayLeaveDays} วัน`,
    ];

    const id = await this.items.create({
      payrollCycleId: cycleId,
      employeeId,
      companyId: cycle.companyId,
      itemType: 'meal_allowance',
      amount: result.amount,
      quantity: result.eligibleDays,
      sourceRefType: null,
      sourceRefId: null,
      note: noteParts.join(' | '),
    }, actor.userId);

    return {
      id,
      workCategory: eligibility.workCategory,
      workingDays: eligibility.workingDays,
      offDayLeaveDays: eligibility.offDayLeaveDays,
      eligibleDays: result.eligibleDays,
      ratePerDay: result.ratePerDay,
      amount: result.amount,
      skipped: false,
    };
  }

  /**
   * Post accumulated attendance late deductions for the payroll period.
   * Reads stored lateDeduction values — does not recalculate attendance.
   */
  async addLateDeduction(
    actor: ActorContext,
    cycleId: string,
    employeeId: string,
  ): Promise<LateDeductionResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);

    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        itemType: 'late_deduction',
        deletedAt: null,
      },
    });
    if (existing) throw new LateDeductionAlreadyExistsError();

    const summary = await this.lateDeductions.aggregateForPeriod(
      employeeId,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );

    if (summary.totalDeduction <= 0) {
      return {
        id: null,
        totalDeduction: 0,
        sourceCount: 0,
        sources: summary.sources,
        skipped: true,
      };
    }

    const firstSource = summary.sources[0];
    const id = await this.items.create({
      payrollCycleId: cycleId,
      employeeId,
      companyId: cycle.companyId,
      itemType: 'late_deduction',
      amount: -summary.totalDeduction,
      quantity: summary.sources.length,
      sourceRefType: 'attendance',
      sourceRefId: firstSource?.attendanceRecordId ?? null,
      note: formatLateDeductionNote(summary),
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'PayrollItem',
      entityId: id,
      action: 'create_late_deduction',
      after: {
        cycleId,
        employeeId,
        totalDeduction: summary.totalDeduction,
        sourceCount: summary.sources.length,
      },
    });

    return {
      id,
      totalDeduction: summary.totalDeduction,
      sourceCount: summary.sources.length,
      sources: summary.sources,
      skipped: false,
    };
  }

  /**
   * Post approved absence penalties for the payroll period.
   * Ignores flagged, waived, disputed, and Owner (no absence status) records.
   */
  async addAbsenceDeduction(
    actor: ActorContext,
    cycleId: string,
    employeeId: string,
  ): Promise<AbsenceDeductionResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);

    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId,
        itemType: 'absence_deduction',
        deletedAt: null,
      },
    });
    if (existing) throw new AbsenceDeductionAlreadyExistsError();

    const summary = await this.absenceDeductions.aggregateForPeriod(
      employeeId,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
      cycleId,
    );

    if (summary.totalDeduction <= 0) {
      return {
        id: null,
        totalDeduction: 0,
        sourceCount: 0,
        sources: summary.sources,
        skipped: true,
      };
    }

    const firstSource = summary.sources[0];
    const id = await this.items.create({
      payrollCycleId: cycleId,
      employeeId,
      companyId: cycle.companyId,
      itemType: 'absence_deduction',
      amount: -summary.totalDeduction,
      quantity: summary.sources.length,
      sourceRefType: 'absence_record',
      sourceRefId: firstSource?.absenceRecordId ?? null,
      note: formatAbsenceDeductionNote(summary),
    }, actor.userId);

    await this.absenceDeductions.linkRecordsToPayrollItem(
      summary.sources.map((s) => s.absenceRecordId),
      id,
    );

    await this.audit.record(actor, {
      entityType: 'PayrollItem',
      entityId: id,
      action: 'create_absence_deduction',
      after: {
        cycleId,
        employeeId,
        totalDeduction: summary.totalDeduction,
        sourceCount: summary.sources.length,
      },
    });

    return {
      id,
      totalDeduction: summary.totalDeduction,
      sourceCount: summary.sources.length,
      sources: summary.sources,
      skipped: false,
    };
  }

  /**
   * Collect monthly deposit via payroll. Cap enforced per employee per company.
   * Deposit belongs to the COLLECTING company — never transferred.
   */
  async addDeposit(actor: ActorContext, cycleId: string, dto: AddDepositDto): Promise<{ id: string }> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();

    const rules = await this.depositSettings.getRules(dto.companyId);
    if (!rules.enabled) throw new DepositDisabledError();

    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
      select: { depositDeductionExempt: true },
    });
    if (employee?.depositDeductionExempt) {
      throw new DepositDisabledError();
    }

    const running = await this.deposits.getRunningTotal(dto.employeeId, dto.companyId);
    if (running + rules.monthlyDeductionAmount > rules.maximumBalanceAmount) {
      throw new DepositCapExceededError(rules.maximumBalanceAmount);
    }

    const itemId = await this.items.create({
      payrollCycleId: cycleId,
      employeeId: dto.employeeId,
      companyId: dto.companyId,
      itemType: rules.deductionItemType as PayrollItemRow['itemType'],
      amount: -rules.monthlyDeductionAmount,
      quantity: 1,
      sourceRefType: null,
      sourceRefId: null,
      note: 'Monthly deposit',
    }, actor.userId);

    await this.deposits.create({
      employeeId: dto.employeeId,
      companyId: dto.companyId,
      cycleId,
      amount: rules.monthlyDeductionAmount,
    }, actor.userId);

    return { id: itemId };
  }

  /**
   * Compute monthly unused off-day bonus from approved leave usage and add a
   * payroll item (type leave_bonus). Skips item creation when bonus is zero.
   */
  async addLeaveBonus(
    actor: ActorContext,
    cycleId: string,
    dto: AddLeaveBonusDto,
  ): Promise<LeaveBonusResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    cycle.assertOpen();
    await this.employeeAccess.assertEmployeeInCompany(dto.employeeId, cycle.companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, dto.employeeId);

    const overrideApproved = dto.overrideApproved ?? false;
    if (overrideApproved) {
      await this.assertOwnerOverrideAllowed(actor);
    }

    const existing = await this.prisma.payrollItem.findFirst({
      where: {
        payrollCycleId: cycleId,
        employeeId: dto.employeeId,
        itemType: 'leave_bonus',
        deletedAt: null,
      },
    });
    if (existing) throw new LeaveBonusAlreadyExistsError();

    const rules = await this.leaveSettings.getRules(cycle.companyId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
      select: { hireDate: true, terminationDate: true },
    });
    const offEntitlement = employee
      ? computeMonthlyOffEntitlement({
        monthlyOffDays: rules.monthlyOffDays,
        periodStartIso: cycle.periodStart.toISOString().slice(0, 10),
        periodEndIso: cycle.periodEnd.toISOString().slice(0, 10),
        hireDate: employee.hireDate,
        terminationDate: employee.terminationDate,
      })
      : { entitledOffDays: rules.monthlyOffDays };
    const params = toLeaveBonusParams(rules, offEntitlement.entitledOffDays);
    const usedOffDays = await this.usedOffDays.countUsedOffDays(
      dto.employeeId,
      cycle.companyId,
      cycle.periodStart,
      cycle.periodEnd,
    );
    const result = computeLeaveBonus(params, { usedOffDays, overrideApproved });

    if (result.bonusAmount <= 0) {
      return {
        id: null,
        usedOffDays: result.usedOffDays,
        eligibleBonusDays: result.eligibleBonusDays,
        bonusAmount: 0,
        overrideApproved: result.overrideApproved,
        capped: result.capped,
        skipped: true,
      };
    }

    const noteParts = [
      `โบนัสจากวันหยุดที่ยังไม่ได้ใช้ ${result.eligibleBonusDays} วัน × ${result.ratePerDay} บาท`,
      `ใช้วันหยุดแล้ว ${result.usedOffDays}/${params.monthlyOffDays} วัน`,
    ];
    if (result.overrideApproved) {
      noteParts.push('เจ้าของอนุมัติยกเว้นเพดาน');
      if (dto.overrideReason?.trim()) noteParts.push(dto.overrideReason.trim());
    } else if (result.capped) {
      noteParts.push('คิดตามเพดานปกติ');
    }

    const id = await this.items.create({
      payrollCycleId: cycleId,
      employeeId: dto.employeeId,
      companyId: cycle.companyId,
      itemType: 'leave_bonus',
      amount: result.bonusAmount,
      quantity: result.eligibleBonusDays,
      sourceRefType: 'leave_bonus',
      sourceRefId: null,
      note: noteParts.join(' | '),
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'PayrollItem',
      entityId: id,
      action: 'create_leave_bonus',
      after: {
        cycleId,
        employeeId: dto.employeeId,
        ...result,
        overrideReason: dto.overrideReason ?? null,
      },
    });

    return {
      id,
      usedOffDays: result.usedOffDays,
      eligibleBonusDays: result.eligibleBonusDays,
      bonusAmount: result.bonusAmount,
      overrideApproved: result.overrideApproved,
      capped: result.capped,
      skipped: false,
    };
  }

  // ── Payslip generation ───────────────────────────────────────────────────

  /**
   * Generate or refresh payslip for one employee. Sums all items into
   * gross (positive), deductions (absolute negative), and net.
   * Recalculates when a payslip already exists (after manual edits).
   */
  async generatePayslip(actor: ActorContext, cycleId: string, employeeId: string): Promise<PayslipResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);

    const employeeItems = await this.items.listByCycleAndEmployee(cycleId, employeeId);
    if (!employeeItems.length) {
      throw new PayslipNotReadyError('ยังไม่มีรายการเงินเดือนในรอบนี้ — กดคำนวณเงินเดือนก่อน');
    }
    const breakdown: Record<string, number> = {};
    let gross = 0;
    let deductions = 0;

    for (const item of employeeItems) {
      breakdown[item.itemType] = (breakdown[item.itemType] ?? 0) + item.amount;
      if (item.amount >= 0) gross += item.amount;
      else deductions += Math.abs(item.amount);
    }

    const roundedGross = Math.round(gross * 100) / 100;
    const roundedDeductions = Math.round(deductions * 100) / 100;
    const net = Math.round((roundedGross - roundedDeductions) * 100) / 100;

    const existing = await this.payslips.findByCycleAndEmployee(cycleId, employeeId);
    if (existing) {
      await this.prisma.payslip.update({
        where: { id: existing.id },
        data: {
          gross: roundedGross,
          deductions: roundedDeductions,
          net,
          breakdown,
          updatedBy: actor.userId,
        },
      });
      await this.audit.record(actor, {
        entityType: 'Payslip', entityId: existing.id, action: 'regenerate',
        after: { cycleId, employeeId, gross: roundedGross, deductions: roundedDeductions, net },
      });
      return {
        id: existing.id,
        employeeId,
        gross: roundedGross,
        deductions: roundedDeductions,
        net,
        breakdown,
      };
    }

    const id = await this.payslips.create({
      payrollCycleId: cycleId,
      employeeId,
      gross: roundedGross,
      deductions: roundedDeductions,
      net,
      breakdown,
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'Payslip', entityId: id, action: 'generate',
      after: { cycleId, employeeId, gross: roundedGross, deductions: roundedDeductions, net },
    });

    return { id, employeeId, gross: roundedGross, deductions: roundedDeductions, net, breakdown };
  }

  async getPayslip(actor: ActorContext, cycleId: string, employeeId: string): Promise<PayslipResponse> {
    return this.getPayslipInternal(actor, cycleId, employeeId);
  }

  async getCycle(actor: ActorContext, cycleId: string): Promise<CycleResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    return this.toCycleResponse(cycle);
  }

  async listCycles(actor: ActorContext, companyId: string): Promise<CycleResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.prisma.payrollCycle.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { periodStart: 'desc' },
      take: 50,
    });
    return rows.map((row) => ({
      id: row.id,
      companyId: row.companyId,
      periodStart: row.periodStart.toISOString().slice(0, 10),
      periodEnd: row.periodEnd.toISOString().slice(0, 10),
      payDate: row.payDate.toISOString().slice(0, 10),
      status: row.status,
    }));
  }

  async getEmployeePayrollView(
    actor: ActorContext,
    employeeId: string,
    companyId: string,
  ): Promise<EmployeePayrollViewDto> {
    await this.employeeAccess.assertEmployeeInCompany(employeeId, companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);

    const [company, employee, currentBand] = await Promise.all([
      this.prisma.company.findFirst({
        where: { id: companyId, deletedAt: null },
        select: { name: true },
      }),
      this.prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
        select: {
          hireDate: true,
          payrollAllocationMode: true,
          masterMonthlySalary: true,
          depositCollectionCompanyId: true,
        },
      }),
      this.prisma.salaryHistory.findFirst({
        where: { employeeId, companyId, deletedAt: null, effectiveTo: null },
        orderBy: { effectiveFrom: 'desc' },
      }),
    ]);

    if (!employee) {
      throw new Error(`Employee ${employeeId} not found`);
    }

    const cycles = await this.prisma.payrollCycle.findMany({
      where: {
        companyId,
        deletedAt: null,
      },
      orderBy: { periodStart: 'desc' },
      take: 500,
    });

    const cycleIds = cycles.map((cycle) => cycle.id);
    const payslipRows = cycleIds.length
      ? await this.prisma.payslip.findMany({
          where: {
            employeeId,
            payrollCycleId: { in: cycleIds },
            deletedAt: null,
          },
          select: { id: true, payrollCycleId: true },
        })
      : [];
    const payslipByCycle = new Map(payslipRows.map((row) => [row.payrollCycleId, row.id]));

    const companyName = company?.name ?? '';
    const history: EmployeePayrollHistoryItemDto[] = [];
    for (const cycle of cycles) {
      const row = await this.overviewAssembler.buildEmployeeRow(cycle, employeeId, companyName);
      if (!row) continue;
      history.push(mapEmployeePayrollHistoryRow(cycle, row, payslipByCycle.get(cycle.id) ?? null));
    }
    history.sort((a, b) => b.periodStart.localeCompare(a.periodStart));

    const latestCycle = cycles[0] ?? null;
    const latestHistory = history[0] ?? null;
    const salaryReviewDue = await this.resolveSalaryReviewDue(employeeId, employee.hireDate, currentBand?.effectiveFrom ?? null);

    const salaryEffectiveFrom = currentBand?.effectiveFrom.toISOString().slice(0, 10) ?? null;
    const latestPeriodEnd = latestCycle?.periodEnd.toISOString().slice(0, 10) ?? null;
    const latestBaseSalary = latestHistory?.baseSalary ?? null;
    const salaryEffectiveAfterPeriod = Boolean(
      salaryEffectiveFrom
      && latestPeriodEnd
      && salaryEffectiveFrom > latestPeriodEnd,
    );
    const salaryAppliesToLatestCycle = Boolean(
      salaryEffectiveFrom
      && latestPeriodEnd
      && salaryEffectiveFrom <= latestPeriodEnd
      && currentBand,
    );
    const salaryNeedsRebuild = Boolean(
      salaryAppliesToLatestCycle
      && (latestBaseSalary ?? 0) === 0
      && latestCycle?.status === 'open',
    );

    const activeCompanyCount = await this.prisma.company.count({
      where: { deletedAt: null, isActive: true },
    });
    const isShared = employee.payrollAllocationMode === 'shared_across_companies';
    const masterSalary = employee.masterMonthlySalary != null
      ? Number(employee.masterMonthlySalary)
      : null;

    return {
      summary: {
        currentSalary: isShared && masterSalary != null
          ? masterSalary
          : (currentBand ? Number(currentBand.monthlySalary) : null),
        salaryType: 'monthly',
        salaryEffectiveFrom,
        lastPayrollDate: latestCycle?.payDate.toISOString().slice(0, 10) ?? null,
        latestNetPay: latestHistory?.netPay ?? null,
        latestBaseSalary,
        payrollStatus: latestCycle
          ? mapEmployeePayrollStatus(latestCycle.status, latestHistory?.netPay ?? 0, latestHistory !== null)
          : null,
        payPeriod: latestCycle
          ? `${latestCycle.periodStart.toISOString().slice(0, 10)} – ${latestCycle.periodEnd.toISOString().slice(0, 10)}`
          : null,
        salaryReviewDue,
        advanceDeductionTotal: latestHistory?.advanceDeduction ?? 0,
        salaryNeedsRebuild,
        salaryEffectiveAfterPeriod,
        payrollAllocationMode: isShared ? 'shared_across_companies' : 'standard',
        masterMonthlySalary: masterSalary,
        perCompanySalary: isShared && masterSalary != null && activeCompanyCount > 0
          ? Math.round((masterSalary / activeCompanyCount) * 100) / 100
          : null,
        activeCompanyCount,
        depositCollectionCompanyId: employee.depositCollectionCompanyId,
      },
      history,
    };
  }

  private async resolveSalaryReviewDue(
    employeeId: string,
    hireDate: Date,
    currentBandEffectiveFrom: Date | null,
  ): Promise<boolean> {
    const now = new Date();
    const msPerDay = 86_400_000;
    const daysSinceHire = Math.floor((now.getTime() - hireDate.getTime()) / msPerDay);
    if (daysSinceHire < 365) return false;

    const lastChange = await this.prisma.employeeChangeHistory.findFirst({
      where: { employeeId, fieldName: { contains: 'salary', mode: 'insensitive' } },
      orderBy: { changedAt: 'desc' },
    });
    const lastReviewAt = lastChange?.changedAt ?? currentBandEffectiveFrom ?? null;
    if (!lastReviewAt) return true;
    return (now.getTime() - lastReviewAt.getTime()) / msPerDay > 365;
  }

  private async getPayslipInternal(actor: ActorContext, cycleId: string, employeeId: string): Promise<PayslipResponse> {
    const cycle = await this.getCycleOrThrow(actor, cycleId);
    await this.employeeAccess.assertEmployeeInCompany(employeeId, cycle.companyId);
    await this.salaryVisibility.assertCanViewSalary(actor.userId, employeeId);
    const row = await this.payslips.findByCycleAndEmployee(cycleId, employeeId);
    if (!row) throw new PayslipNotFoundError();
    return row;
  }

  // ── Workflow integration ──────────────────────────────────────────────────

  /**
   * Outbox handler: called when a `bonus` workflow resolves.
   * The entityId is the PayrollItem.id for the pending bonus item.
   *
   * On approval: the bonus item remains in the cycle; no state change needed
   *   because `addItem()` already persisted it — approval just confirms it.
   *   A note is written to the item for auditability.
   * On rejection/cancellation: soft-delete the PayrollItem so it is excluded
   *   from cycle totals and payslip generation.
   */
  async onBonusWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    const item = await this.prisma.payrollItem.findFirst({
      where: { id: entityId, deletedAt: null },
    });
    if (!item) {
      this.logger.warn(`onBonusWorkflowResolved: PayrollItem ${entityId} not found`);
      return;
    }

    if (status === 'approved') {
      // Stamp approval note on the item; the item is already active in the cycle.
      await this.prisma.payrollItem.update({
        where: { id: item.id },
        data: { note: [item.note, 'workflow:approved'].filter(Boolean).join(' | ') },
      });
      this.logger.log(`Bonus PayrollItem ${item.id} approved — included in cycle`);
    } else {
      // Soft-delete the item to exclude it from payroll totals.
      await this.prisma.payrollItem.update({
        where: { id: item.id },
        data: {
          deletedAt: new Date(),
          note: [item.note, `workflow:${status}`].filter(Boolean).join(' | '),
        },
      });
      this.logger.log(`Bonus PayrollItem ${item.id} ${status} — removed from cycle`);
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async getCycleOrThrow(actor: ActorContext, id: string): Promise<PayrollCycle> {
    const c = await this.cycles.findById(id);
    if (!c) throw new PayrollCycleNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, c.companyId);
    return c;
  }

  private async assertOwnerOverrideAllowed(actor: ActorContext): Promise<void> {
    const assignment = await this.prisma.businessRoleAssignment.findFirst({
      where: {
        userId: actor.userId,
        isActive: true,
        deletedAt: null,
        role: 'owner',
      },
      select: { role: true },
    });
    if (!assignment) throw new LeaveBonusOverrideNotAllowedError();
  }

  private toCycleResponse(c: PayrollCycle): CycleResponse {
    const p = c.toPersistence();
    return {
      id: p.id, companyId: p.companyId,
      periodStart: p.periodStart.toISOString().slice(0, 10),
      periodEnd: p.periodEnd.toISOString().slice(0, 10),
      payDate: p.payDate.toISOString().slice(0, 10),
      status: p.status,
    };
  }
}

function mapEmployeePayrollStatus(
  cycleStatus: string,
  netPay: number,
  hasItems: boolean,
): EmployeePayrollHistoryStatus {
  if (cycleStatus === 'paid') return 'paid';
  if (cycleStatus === 'locked') return 'approved';
  if (!hasItems || netPay === 0) return 'draft';
  return 'calculated';
}

function mapEmployeePayrollHistoryRow(
  cycle: {
    id: string;
    periodStart: Date;
    periodEnd: Date;
    payDate: Date;
    status: string;
  },
  row: PayrollOverviewEmployeeRow,
  payslipId: string | null,
): EmployeePayrollHistoryItemDto {
  const grossPay = row.baseSalary
    + row.mealAllowance
    + row.crossBorderAllowance
    + row.otAmount
    + row.commissionAmount
    + row.bonusAmount;
  return {
    id: payslipId ?? cycle.id,
    payrollCycleId: cycle.id,
    payslipId,
    periodStart: cycle.periodStart.toISOString().slice(0, 10),
    periodEnd: cycle.periodEnd.toISOString().slice(0, 10),
    payDate: cycle.payDate.toISOString().slice(0, 10),
    baseSalary: row.baseSalary,
    mealAllowance: row.mealAllowance,
    mealEligibleDays: row.mealEligibleDays,
    crossBorderAllowance: row.crossBorderAllowance,
    crossBorderEligibleDays: row.crossBorderEligibleDays,
    lateDeduction: row.lateDeduction,
    absenceDeduction: row.absenceDeduction,
    deposit: row.deposit,
    grossPay,
    otAmount: row.otAmount,
    commissionAmount: row.commissionAmount,
    bonusAmount: row.bonusAmount,
    deductions: row.totalDeduction,
    advanceDeduction: row.advanceDeduction,
    netPay: row.netPayAmount,
    status: mapEmployeePayrollStatus(cycle.status, row.netPayAmount, grossPay > 0 || row.totalDeduction > 0),
  };
}

const ALWAYS_DEDUCTION_TYPES = new Set([
  'late_deduction',
  'absence_deduction',
  'deposit',
  'excess_off_deduction',
  'break_deduction',
  'consecutive_leave_deduction',
]);

/** UI sends absolute amounts; store deductions as negative. */
function signPayrollAmount(itemType: string, previousAmount: number, inputAmount: number): number {
  const abs = Math.round(Math.abs(inputAmount) * 100) / 100;
  if (ALWAYS_DEDUCTION_TYPES.has(itemType) || previousAmount < 0) return -abs;
  return abs;
}
