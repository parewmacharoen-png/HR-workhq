// ============================================================================
// Shared payroll service — master salary split across all active companies
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { AuditService } from '../../../shared/audit/audit.service';
import { resolveInitialSalaryEffectiveDate } from '../domain/services/salary-band-employment.util';
import {
  allocateShareOfTotal,
  qualifiesForSharedPayroll,
  resolveAdminCommissionOfficeType,
  splitAmountAcrossCompanies,
  roundMoney,
  type PayrollAllocationMode,
} from '../domain/services/shared-payroll.policy';
import { MealEligibleDaysService } from './meal-eligible-days.service';
import { PayrollSettingsService } from '../../settings/application/payroll-settings.service';
import { LeaveSettingsService } from '../../settings/application/leave-settings.service';
import { UsedOffDaysService } from './used-off-days.service';
import { LateDeductionAggregatorService } from './late-deduction-aggregator.service';
import { AbsenceDeductionAggregatorService } from './absence-deduction-aggregator.service';
import { ExcessOffDayAggregatorService } from './excess-off-day-aggregator.service';
import { ShortNoticeLeaveAggregatorService } from './short-notice-leave-aggregator.service';
import { BreakDeductionAggregatorService } from './break-deduction-aggregator.service';
import { ConsecutiveLeavePenaltyAggregatorService } from './consecutive-leave-penalty-aggregator.service';
import { computeMealAllowance } from '../domain/services/meal-allowance.service';
import { computeMonthlyOffEntitlement } from '../../leave/domain/services/monthly-off-entitlement.service';
import { computeLeaveBonus, toLeaveBonusParams } from '../domain/services/leave-bonus.service';
import { isBuilderGeneratedNote, MANUAL_ADJUSTMENT_ITEM_TYPES } from '../domain/payroll-builder.constants';
import { PayrollBuilderService } from './payroll-builder.service';

export interface SharedPayrollEmployeeInfo {
  employeeId: string;
  qualifies: boolean;
  mode: PayrollAllocationMode;
  masterMonthlySalary: number | null;
  depositCollectionCompanyId: string | null;
  activeCompanyCount: number;
  perCompanySalary: number | null;
  department: string | null;
  position: string | null;
}

export interface BootstrapSharedPayrollInput {
  employeeId: string;
  masterMonthlySalary: number;
  effectiveFromIso: string;
  depositCollectionCompanyId?: string;
  department?: string | null;
  position?: string | null;
  businessRole?: string | null;
  reason?: string;
}

export interface MigrateSharedPayrollResult {
  employeeId: string;
  globalId: string;
  migrated: boolean;
  reason?: string;
  masterMonthlySalary?: number;
}

export interface SharedPayrollAllocation {
  mode: PayrollAllocationMode;
  masterMonthlySalary: number | null;
  companyCount: number;
}

@Injectable()
export class SharedPayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly mealEligibleDays: MealEligibleDaysService,
    private readonly payrollSettings: PayrollSettingsService,
    private readonly leaveSettings: LeaveSettingsService,
    private readonly usedOffDays: UsedOffDaysService,
    private readonly lateDeductions: LateDeductionAggregatorService,
    private readonly absenceDeductions: AbsenceDeductionAggregatorService,
    private readonly excessOffDeductions: ExcessOffDayAggregatorService,
    private readonly shortNoticeLeaveDeductions: ShortNoticeLeaveAggregatorService,
    private readonly breakDeductions: BreakDeductionAggregatorService,
    private readonly consecutiveLeavePenalties: ConsecutiveLeavePenaltyAggregatorService,
    @Optional() @Inject(forwardRef(() => PayrollBuilderService))
    private readonly payrollBuilder?: PayrollBuilderService,
  ) {}

  async listActiveCompanyIds(): Promise<string[]> {
    const rows = await this.prisma.company.findMany({
      where: { deletedAt: null, isActive: true },
      select: { id: true },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => r.id);
  }

  async getAllocationForEmployee(employeeId: string): Promise<SharedPayrollAllocation> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        payrollAllocationMode: true,
        masterMonthlySalary: true,
      },
    });
    const companyCount = (await this.listActiveCompanyIds()).length;
    if (!employee || employee.payrollAllocationMode !== 'shared_across_companies') {
      return { mode: 'standard', masterMonthlySalary: null, companyCount };
    }
    return {
      mode: 'shared_across_companies',
      masterMonthlySalary: employee.masterMonthlySalary != null
        ? Number(employee.masterMonthlySalary)
        : null,
      companyCount,
    };
  }

  isSharedAllocation(alloc: SharedPayrollAllocation): boolean {
    return alloc.mode === 'shared_across_companies' && alloc.companyCount > 1;
  }

  async ensureSharedAssignments(
    actor: ActorContext,
    employeeId: string,
    effectiveFromIso: string,
  ): Promise<void> {
    const companyIds = await this.listActiveCompanyIds();
    const effectiveFrom = new Date(effectiveFromIso);
    const primary = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        deletedAt: null,
        isPrimaryCompany: true,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
      },
      orderBy: { effectiveFrom: 'desc' },
    });

    for (const companyId of companyIds) {
      const existing = await this.prisma.employeeAssignment.findFirst({
        where: {
          employeeId,
          companyId,
          deletedAt: null,
          effectiveFrom: { lte: effectiveFrom },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: effectiveFrom } }],
        },
      });
      if (existing) continue;

      await this.prisma.employeeAssignment.create({
        data: {
          id: randomUUID(),
          employeeId,
          companyId,
          effectiveFrom,
          isPrimaryCompany: primary?.companyId === companyId,
          isPrimaryTeam: false,
          roleLevel: 'employee',
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    }
  }

  async syncSalaryHistories(
    actor: ActorContext,
    employeeId: string,
    masterSalary: number,
    startDateIso: string,
    reason: string,
  ): Promise<void> {
    const companyIds = await this.listActiveCompanyIds();
    if (!companyIds.length) return;

    const amounts = splitAmountAcrossCompanies(masterSalary, companyIds.length);
    const effectiveFrom = resolveInitialSalaryEffectiveDate(
      new Date(startDateIso),
      new Date(startDateIso),
      false,
    );

    for (let i = 0; i < companyIds.length; i += 1) {
      const companyId = companyIds[i];
      const perCompany = amounts[i];
      const current = await this.prisma.salaryHistory.findFirst({
        where: {
          employeeId,
          companyId,
          deletedAt: null,
          effectiveTo: null,
        },
        orderBy: { effectiveFrom: 'desc' },
      });

      if (current && Number(current.monthlySalary) === perCompany) continue;

      if (current) {
        await this.prisma.salaryHistory.update({
          where: { id: current.id },
          data: { effectiveTo: effectiveFrom, updatedBy: actor.userId },
        });
      }

      await this.prisma.salaryHistory.create({
        data: {
          employeeId,
          companyId,
          monthlySalary: perCompany,
          effectiveFrom,
          reason,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
      });
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        payrollAllocationMode: 'shared_across_companies',
        masterMonthlySalary: masterSalary,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'shared_salary_synced',
      after: { masterSalary, companyCount: companyIds.length, amounts },
    });
  }

  async reconcileSharedSalariesForCompany(
    actor: ActorContext,
    companyId: string,
    asOf: Date,
  ): Promise<void> {
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        payrollAllocationMode: 'shared_across_companies',
        masterMonthlySalary: { not: null },
        assignments: {
          some: {
            companyId,
            deletedAt: null,
            effectiveFrom: { lte: asOf },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
          },
        },
      },
      select: { id: true, masterMonthlySalary: true },
    });

    for (const emp of employees) {
      const master = Number(emp.masterMonthlySalary);
      await this.syncSalaryHistories(
        actor,
        emp.id,
        master,
        asOf.toISOString().slice(0, 10),
        'ปรับเงินเดือนแบ่งตามจำนวนบริษัทที่ใช้งาน',
      );
    }
  }

  async aggregateMealAcrossCompanies(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ totalAmount: number; eligibleDays: number; officeDays: number; wfhDays: number }> {
    const companyIds = await this.listActiveCompanyIds();
    let eligibleDays = 0;
    let officeDays = 0;
    let wfhDays = 0;
    let totalAmount = 0;

    for (const companyId of companyIds) {
      const rules = await this.payrollSettings.getRules(companyId);
      const eligibility = await this.mealEligibleDays.countEligibleDays(
        employeeId,
        companyId,
        periodStart,
        periodEnd,
      );
      const meal = computeMealAllowance(
        { ratePerDay: rules.mealAllowancePerDay },
        { eligibleDays: eligibility.eligibleDays },
      );
      totalAmount += meal.amount;
      eligibleDays += meal.eligibleDays;
      officeDays += eligibility.officeDays;
      wfhDays += eligibility.wfhDays;
    }

    return { totalAmount: roundMoney(totalAmount), eligibleDays, officeDays, wfhDays };
  }

  async aggregateCrossBorderAcrossCompanies(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ totalAmount: number; officeDays: number; wfhDays: number }> {
    const companyIds = await this.listActiveCompanyIds();
    let totalAmount = 0;
    let officeDays = 0;
    let wfhDays = 0;

    for (const companyId of companyIds) {
      const rules = await this.payrollSettings.getRules(companyId);
      const eligibility = await this.mealEligibleDays.countEligibleDays(
        employeeId,
        companyId,
        periodStart,
        periodEnd,
      );
      const rate = Math.max(0, rules.crossBorderAllowancePerDay);
      totalAmount += roundMoney(rate * eligibility.officeDays);
      officeDays += eligibility.officeDays;
      wfhDays += eligibility.wfhDays;
    }

    return { totalAmount: roundMoney(totalAmount), officeDays, wfhDays };
  }

  async aggregateLeaveBonusAcrossCompanies(
    employee: { id: string; hireDate: Date; terminationDate: Date | null },
    periodStart: Date,
    periodEnd: Date,
  ): Promise<{ totalBonus: number; bonusDays: number; ratePerDay: number }> {
    const companyIds = await this.listActiveCompanyIds();
    let totalBonus = 0;
    let bonusDays = 0;
    let ratePerDay = 0;

    for (const companyId of companyIds) {
      const leaveRules = await this.leaveSettings.getRules(companyId);
      const offEntitlement = computeMonthlyOffEntitlement({
        monthlyOffDays: leaveRules.monthlyOffDays,
        periodStartIso: periodStart.toISOString().slice(0, 10),
        periodEndIso: periodEnd.toISOString().slice(0, 10),
        hireDate: employee.hireDate,
        terminationDate: employee.terminationDate,
      });
      const leaveParams = toLeaveBonusParams(leaveRules, offEntitlement.entitledOffDays);
      const usedOffDays = await this.usedOffDays.countUsedOffDays(
        employee.id,
        companyId,
        periodStart,
        periodEnd,
      );
      const result = computeLeaveBonus(leaveParams, { usedOffDays, overrideApproved: false });
      totalBonus += result.bonusAmount;
      bonusDays += result.eligibleBonusDays;
      ratePerDay = result.ratePerDay;
    }

    return { totalBonus: roundMoney(totalBonus), bonusDays, ratePerDay };
  }

  async aggregateDeductionsAcrossCompanies(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
    cycleId: string,
  ): Promise<{
    late: number;
    absence: number;
    excessOff: number;
    shortNotice: number;
    breakDeduction: number;
    consecutiveLeave: number;
  }> {
    const companyIds = await this.listActiveCompanyIds();
    let late = 0;
    let absence = 0;
    let excessOff = 0;
    let shortNotice = 0;
    let breakDeduction = 0;
    let consecutiveLeave = 0;

    for (const companyId of companyIds) {
      const lateSummary = await this.lateDeductions.aggregateForPeriod(
        employeeId, companyId, periodStart, periodEnd,
      );
      const absenceSummary = await this.absenceDeductions.aggregateForPeriod(
        employeeId, companyId, periodStart, periodEnd, cycleId,
      );
      const excessOffSummary = await this.excessOffDeductions.aggregateForPeriod(
        employeeId, companyId, periodStart, periodEnd,
      );
      const shortNoticeSummary = await this.shortNoticeLeaveDeductions.aggregateForPeriod(
        employeeId, companyId, periodStart, periodEnd,
      );
      const breakSummary = await this.breakDeductions.aggregateForPeriod(
        employeeId, companyId, periodStart, periodEnd,
      );
      const consecutiveSummary = await this.consecutiveLeavePenalties.aggregateForPeriod(
        employeeId, companyId, periodStart, periodEnd,
      );

      late += lateSummary.totalDeduction;
      absence += absenceSummary.totalDeduction;
      excessOff += excessOffSummary.totalDeduction;
      shortNotice += shortNoticeSummary.totalDeduction;
      breakDeduction += breakSummary.totalDeduction;
      consecutiveLeave += consecutiveSummary.totalDeduction;
    }

    return {
      late: roundMoney(late),
      absence: roundMoney(absence),
      excessOff: roundMoney(excessOff),
      shortNotice: roundMoney(shortNotice),
      breakDeduction: roundMoney(breakDeduction),
      consecutiveLeave: roundMoney(consecutiveLeave),
    };
  }

  allocateCompanyShare(total: number, companyCount: number): number {
    return allocateShareOfTotal(total, companyCount);
  }

  async ensureAdminCommissionProfiles(
    actor: ActorContext,
    employeeId: string,
    org: {
      department?: string | null;
      position?: string | null;
      businessRole?: string | null;
    },
  ): Promise<void> {
    if (!qualifiesForSharedPayroll(org)) return;

    const officeType = resolveAdminCommissionOfficeType(org);
    const companyIds = await this.listActiveCompanyIds();

    for (const companyId of companyIds) {
      await this.prisma.adminCommissionEmployeeProfile.upsert({
        where: {
          companyId_employeeId: { companyId, employeeId },
        },
        create: {
          companyId,
          employeeId,
          officeType,
          defaultShift: 'day',
          isActive: true,
          createdBy: actor.userId,
          updatedBy: actor.userId,
        },
        update: {
          officeType,
          isActive: true,
          deletedAt: null,
          deletedBy: null,
          updatedBy: actor.userId,
        },
      });
    }

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'admin_commission_profiles_ensured',
      after: { officeType, companyCount: companyIds.length },
    });
  }

  static qualifies = qualifiesForSharedPayroll;

  async getEmployeeInfo(employeeId: string): Promise<SharedPayrollEmployeeInfo> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        department: true,
        position: true,
        payrollAllocationMode: true,
        masterMonthlySalary: true,
        depositCollectionCompanyId: true,
      },
    });
    const companyCount = (await this.listActiveCompanyIds()).length;
    if (!employee) {
      return {
        employeeId,
        qualifies: false,
        mode: 'standard',
        masterMonthlySalary: null,
        depositCollectionCompanyId: null,
        activeCompanyCount: companyCount,
        perCompanySalary: null,
        department: null,
        position: null,
      };
    }
    const qualifies = qualifiesForSharedPayroll({
      department: employee.department,
      position: employee.position,
    });
    const master = employee.masterMonthlySalary != null ? Number(employee.masterMonthlySalary) : null;
    const isShared = employee.payrollAllocationMode === 'shared_across_companies';
    return {
      employeeId: employee.id,
      qualifies,
      mode: isShared ? 'shared_across_companies' : 'standard',
      masterMonthlySalary: master,
      depositCollectionCompanyId: employee.depositCollectionCompanyId,
      activeCompanyCount: companyCount,
      perCompanySalary: master != null && companyCount > 0
        ? allocateShareOfTotal(master, companyCount)
        : null,
      department: employee.department,
      position: employee.position,
    };
  }

  async bootstrapSharedEmployee(
    actor: ActorContext,
    input: BootstrapSharedPayrollInput,
  ): Promise<void> {
    const org = {
      department: input.department,
      position: input.position,
      businessRole: input.businessRole,
    };
    if (!qualifiesForSharedPayroll(org)) return;

    if (input.depositCollectionCompanyId) {
      await this.prisma.employee.update({
        where: { id: input.employeeId },
        data: {
          depositCollectionCompanyId: input.depositCollectionCompanyId,
          updatedBy: actor.userId,
        },
      });
    }

    await this.ensureSharedAssignments(actor, input.employeeId, input.effectiveFromIso);
    await this.syncSalaryHistories(
      actor,
      input.employeeId,
      input.masterMonthlySalary,
      input.effectiveFromIso,
      input.reason ?? 'เงินเดือนแบ่งตามบริษัทที่ใช้งาน',
    );
    await this.ensureAdminCommissionProfiles(actor, input.employeeId, org);
    await this.syncEmployeeOpenCyclesAllCompanies(actor, input.employeeId);
  }

  async updateSettings(
    actor: ActorContext,
    employeeId: string,
    input: {
      masterMonthlySalary?: number;
      depositCollectionCompanyId?: string | null;
      effectiveFromIso?: string;
    },
  ): Promise<SharedPayrollEmployeeInfo> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        department: true,
        position: true,
        payrollAllocationMode: true,
        masterMonthlySalary: true,
        hireDate: true,
      },
    });
    if (!employee) throw new Error('Employee not found');

    const effectiveFrom = input.effectiveFromIso
      ?? employee.hireDate.toISOString().slice(0, 10);

    if (input.depositCollectionCompanyId !== undefined) {
      await this.prisma.employee.update({
        where: { id: employeeId },
        data: {
          depositCollectionCompanyId: input.depositCollectionCompanyId,
          updatedBy: actor.userId,
        },
      });
    }

    if (input.masterMonthlySalary != null && input.masterMonthlySalary >= 1) {
      await this.syncSalaryHistories(
        actor,
        employeeId,
        input.masterMonthlySalary,
        effectiveFrom,
        'ปรับเงินเดือนรวม (shared payroll)',
      );
    }

    return this.getEmployeeInfo(employeeId);
  }

  async reconcileAllSharedEmployees(
    actor: ActorContext,
    asOf = new Date(),
  ): Promise<{ employeesUpdated: number }> {
    const asOfIso = asOf.toISOString().slice(0, 10);
    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        payrollAllocationMode: 'shared_across_companies',
        masterMonthlySalary: { not: null },
      },
      select: {
        id: true,
        masterMonthlySalary: true,
        department: true,
        position: true,
      },
    });

    for (const emp of employees) {
      await this.ensureSharedAssignments(actor, emp.id, asOfIso);
      await this.syncSalaryHistories(
        actor,
        emp.id,
        Number(emp.masterMonthlySalary),
        asOfIso,
        'ปรับเงินเดือนตามจำนวนบริษัทที่ใช้งาน',
      );
      await this.ensureAdminCommissionProfiles(actor, emp.id, {
        department: emp.department,
        position: emp.position,
      });
    }

    await this.audit.record(actor, {
      entityType: 'SharedPayroll',
      entityId: 'reconcile-all',
      action: 'reconcile_all_shared',
      after: { employeesUpdated: employees.length, asOf: asOfIso },
    });

    return { employeesUpdated: employees.length };
  }

  async migrateQualifyingEmployees(
    actor: ActorContext,
    employeeId?: string,
  ): Promise<MigrateSharedPayrollResult[]> {
    const rows = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        payrollAllocationMode: 'standard',
        ...(employeeId ? { id: employeeId } : {}),
      },
      select: {
        id: true,
        globalId: true,
        department: true,
        position: true,
        hireDate: true,
        depositCollectionCompanyId: true,
        assignments: {
          where: { deletedAt: null, effectiveTo: null },
          select: { companyId: true, isPrimaryCompany: true },
        },
      },
    });

    const results: MigrateSharedPayrollResult[] = [];
    for (const emp of rows) {
      if (!qualifiesForSharedPayroll({ department: emp.department, position: emp.position })) {
        results.push({
          employeeId: emp.id,
          globalId: emp.globalId,
          migrated: false,
          reason: 'not_qualified',
        });
        continue;
      }

      const master = await this.inferMasterSalaryForMigration(emp.id);
      if (master == null || master < 1) {
        results.push({
          employeeId: emp.id,
          globalId: emp.globalId,
          migrated: false,
          reason: 'no_salary',
        });
        continue;
      }

      const primary = emp.assignments.find((a) => a.isPrimaryCompany) ?? emp.assignments[0];
      const depositCompanyId = emp.depositCollectionCompanyId ?? primary?.companyId;

      await this.bootstrapSharedEmployee(actor, {
        employeeId: emp.id,
        masterMonthlySalary: master,
        effectiveFromIso: emp.hireDate.toISOString().slice(0, 10),
        depositCollectionCompanyId: depositCompanyId ?? undefined,
        department: emp.department,
        position: emp.position,
        reason: 'ย้ายมาใช้ระบบเงินเดือนแบ่งตามบริษัท',
      });

      results.push({
        employeeId: emp.id,
        globalId: emp.globalId,
        migrated: true,
        masterMonthlySalary: master,
      });
    }

    return results;
  }

  private async inferMasterSalaryForMigration(employeeId: string): Promise<number | null> {
    const companyCount = (await this.listActiveCompanyIds()).length;
    if (companyCount <= 0) return null;

    const bands = await this.prisma.salaryHistory.findMany({
      where: { employeeId, deletedAt: null, effectiveTo: null },
      select: { companyId: true, monthlySalary: true },
    });
    if (!bands.length) return null;

    const amounts = bands.map((b) => Number(b.monthlySalary));
    const distinct = [...new Set(amounts.map((a) => roundMoney(a)))];
    if (distinct.length === 1 && bands.length >= 1) {
      return roundMoney(distinct[0] * companyCount);
    }
    return roundMoney(amounts.reduce((sum, a) => sum + a, 0));
  }

  async syncEmployeeOpenCyclesAllCompanies(
    actor: ActorContext,
    employeeId: string,
  ): Promise<void> {
    if (!this.payrollBuilder) return;
    const companyIds = await this.listActiveCompanyIds();
    for (const companyId of companyIds) {
      await this.payrollBuilder.syncEmployeeInOpenCycles(actor, employeeId, companyId).catch(() => undefined);
    }
  }

  async aggregateManualAdjustmentsAcrossCompanies(
    employeeId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<number> {
    const companyIds = await this.listActiveCompanyIds();
    let total = 0;

    for (const companyId of companyIds) {
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: {
          companyId,
          deletedAt: null,
          periodStart,
          periodEnd,
        },
        select: { id: true },
      });
      if (!cycle) continue;

      const rows = await this.prisma.payrollItem.findMany({
        where: {
          payrollCycleId: cycle.id,
          employeeId,
          itemType: { in: [...MANUAL_ADJUSTMENT_ITEM_TYPES] },
          deletedAt: null,
        },
      });
      total += rows
        .filter((row) => !isBuilderGeneratedNote(row.note))
        .reduce((sum, row) => sum + Number(row.amount), 0);
    }

    return roundMoney(total);
  }
}
