// ============================================================================
// modules/exit/application/employee-deposit-settings.service.ts
// ============================================================================

import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { EmployeeProfileAccessService } from '../../employee/application/employee-profile-access.service';
import { resolveDepositProfile } from '../domain/services/deposit-profile.util';
import {
  AddLegacyDepositDto,
  UpdateEmployeeDepositSettingsDto,
} from './dto/exit.dto';
import { DEPOSIT_REPOSITORY, DepositRepository } from '../../payroll/domain/repositories/payroll.repository';
import { DepositSettingsService } from '../../settings/application/deposit-settings.service';

@Injectable()
export class EmployeeDepositSettingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: EmployeeProfileAccessService,
    private readonly audit: AuditService,
    @Inject(DEPOSIT_REPOSITORY) private readonly deposits: DepositRepository,
    private readonly depositRules: DepositSettingsService,
  ) {}

  async update(actor: ActorContext, employeeId: string, dto: UpdateEmployeeDepositSettingsDto) {
    await this.access.assertPayrollEdit(actor, employeeId);

    // Backward-compatible: amount + company on settings PATCH adds a per-company entry.
    if (dto.legacyDepositAmount != null && dto.legacyDepositAmount > 0) {
      if (!dto.legacyDepositCompanyId) {
        throw new BadRequestException('กรุณาระบุบริษัทที่เก็บเงินประกันก่อนใช้ระบบ');
      }
      await this.addLegacyDeposit(actor, employeeId, {
        companyId: dto.legacyDepositCompanyId,
        amount: dto.legacyDepositAmount,
        reason: dto.reason,
      });
      if (dto.depositDeductionExempt != null) {
        return this.updateExemptOnly(actor, employeeId, dto.depositDeductionExempt, dto.reason);
      }
      return { employeeId, added: true };
    }

    return this.updateExemptOnly(
      actor,
      employeeId,
      dto.depositDeductionExempt,
      dto.reason,
    );
  }

  async addLegacyDeposit(
    actor: ActorContext,
    employeeId: string,
    dto: AddLegacyDepositDto,
  ) {
    await this.access.assertPayrollEdit(actor, employeeId);

    const amount = roundMoney(dto.amount);
    if (amount <= 0) {
      throw new BadRequestException('จำนวนเงินต้องมากกว่า 0');
    }
    if (!dto.reason.trim()) {
      throw new BadRequestException('กรุณาระบุเหตุผลการบันทึก');
    }

    const company = await this.prisma.company.findFirst({
      where: { id: dto.companyId, deletedAt: null, isActive: true },
    });
    if (!company) {
      throw new BadRequestException('ไม่พบบริษัทที่เลือก');
    }

    await this.migrateProfileLegacyToLedger(actor, employeeId);

    const DEPOSIT_CAP = 3000;
    const currentTotal = await this.deposits.getRunningTotal(employeeId, dto.companyId);
    if (currentTotal + amount > DEPOSIT_CAP) {
      const remaining = Math.max(0, roundMoney(DEPOSIT_CAP - currentTotal));
      throw new BadRequestException(
        remaining <= 0
          ? `ยอดรวมครบเพดาน ฿${DEPOSIT_CAP.toLocaleString('th-TH')} แล้ว — ลบหรือลดรายการเดิมก่อนเพิ่มรายการใหม่`
          : `เพิ่มไม่ได้ ยอดรวมจะเกินเพดาน ฿${DEPOSIT_CAP.toLocaleString('th-TH')} (ใช้ไปแล้ว ฿${currentTotal.toLocaleString('th-TH')} เหลือเพิ่มได้ ฿${remaining.toLocaleString('th-TH')})`,
      );
    }

    const depositId = await this.deposits.create({
      employeeId,
      companyId: dto.companyId,
      cycleId: null,
      amount,
    }, actor.userId);

    await this.maybeAutoExemptAtCap(actor, employeeId);

    await this.audit.record(actor, {
      entityType: 'Deposit',
      entityId: depositId,
      action: 'deposit_legacy_added',
      after: {
        employeeId,
        companyId: dto.companyId,
        amount,
        reason: dto.reason.trim(),
      },
    });

    return {
      id: depositId,
      employeeId,
      companyId: dto.companyId,
      companyCode: company.code,
      companyName: company.name,
      amount,
      isLegacy: true,
    };
  }

  async deleteLedgerEntry(
    actor: ActorContext,
    employeeId: string,
    depositId: string,
    reason: string,
  ) {
    await this.access.assertPayrollEdit(actor, employeeId);
    if (!reason.trim()) {
      throw new BadRequestException('กรุณาระบุเหตุผลการลบ');
    }

    // Profile-level legacy (pre-ledger) — no deposit row id yet.
    if (depositId === 'profile') {
      return this.deleteProfileLegacy(actor, employeeId, reason.trim());
    }

    const deleted = await this.deposits.softDelete(depositId, actor.userId);
    if (!deleted || deleted.employeeId !== employeeId) {
      throw new BadRequestException('ไม่พบรายการเงินประกัน');
    }

    // Remove matching open-cycle payroll deposit item so the payslip stays in sync.
    if (deleted.payrollCycleId) {
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: { id: deleted.payrollCycleId, deletedAt: null },
        select: { status: true },
      });
      if (cycle?.status === 'open') {
        await this.prisma.payrollItem.updateMany({
          where: {
            payrollCycleId: deleted.payrollCycleId,
            employeeId,
            itemType: 'deposit',
            deletedAt: null,
          },
          data: {
            deletedAt: new Date(),
            deletedBy: actor.userId,
            updatedBy: actor.userId,
          },
        });
      }
    }

    await this.audit.record(actor, {
      entityType: 'Deposit',
      entityId: depositId,
      action: 'deposit_ledger_deleted',
      after: { employeeId, amount: deleted.amount, reason: reason.trim() },
    });

    return { id: depositId, deleted: true };
  }

  async updateLedgerEntry(
    actor: ActorContext,
    employeeId: string,
    depositId: string,
    amount: number,
    reason: string,
  ) {
    await this.access.assertPayrollEdit(actor, employeeId);
    if (!reason.trim()) {
      throw new BadRequestException('กรุณาระบุเหตุผลการแก้ไข');
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException('จำนวนเงินต้องมากกว่า 0');
    }

    const updated = await this.deposits.updateAmount(depositId, amount, actor.userId);
    if (!updated || updated.employeeId !== employeeId) {
      throw new BadRequestException('ไม่พบรายการเงินประกัน');
    }

    if (updated.payrollCycleId) {
      const cycle = await this.prisma.payrollCycle.findFirst({
        where: { id: updated.payrollCycleId, deletedAt: null },
        select: { status: true },
      });
      if (cycle?.status === 'open') {
        await this.prisma.payrollItem.updateMany({
          where: {
            payrollCycleId: updated.payrollCycleId,
            employeeId,
            itemType: 'deposit',
            deletedAt: null,
          },
          data: {
            amount: -amount,
            updatedBy: actor.userId,
          },
        });
      }
    }

    await this.audit.record(actor, {
      entityType: 'Deposit',
      entityId: depositId,
      action: 'deposit_ledger_updated',
      after: { employeeId, amount, reason: reason.trim() },
    });

    return updated;
  }

  private async deleteProfileLegacy(
    actor: ActorContext,
    employeeId: string,
    reason: string,
  ): Promise<{ id: string; deleted: boolean }> {
    const before = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        legacyDepositAmount: true,
        legacyDepositCompanyId: true,
      },
    });
    if (!before) throw new BadRequestException('ไม่พบพนักงาน');
    const amount = before.legacyDepositAmount != null
      ? roundMoney(Number(before.legacyDepositAmount))
      : 0;
    if (amount <= 0) {
      throw new BadRequestException('ไม่พบรายการเงินประกันก่อนใช้ระบบ');
    }

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        legacyDepositAmount: null,
        legacyDepositCompanyId: null,
        updatedBy: actor.userId,
      },
    });

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'deposit_profile_legacy_deleted',
      after: {
        amount,
        companyId: before.legacyDepositCompanyId,
        reason,
      },
    });

    return { id: 'profile', deleted: true };
  }

  /** Move single profile-level legacy fields into a ledger row so multi-company entries can coexist. */
  private async migrateProfileLegacyToLedger(
    actor: ActorContext,
    employeeId: string,
  ): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        legacyDepositAmount: true,
        legacyDepositCompanyId: true,
      },
    });
    if (!employee) throw new BadRequestException('Employee not found');

    const amount = employee.legacyDepositAmount != null
      ? roundMoney(Number(employee.legacyDepositAmount))
      : 0;
    if (amount <= 0 || !employee.legacyDepositCompanyId) return;

    await this.deposits.create({
      employeeId,
      companyId: employee.legacyDepositCompanyId,
      cycleId: null,
      amount,
    }, actor.userId);

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        legacyDepositAmount: null,
        legacyDepositCompanyId: null,
        updatedBy: actor.userId,
      },
    });
  }

  private async updateExemptOnly(
    actor: ActorContext,
    employeeId: string,
    depositDeductionExempt: boolean | undefined,
    reason: string,
  ) {
    const before = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        depositDeductionExempt: true,
        legacyDepositAmount: true,
        legacyDepositCompanyId: true,
      },
    });
    if (!before) throw new BadRequestException('Employee not found');

    const nextExempt = depositDeductionExempt ?? before.depositDeductionExempt;
    const updated = await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        depositDeductionExempt: nextExempt,
        updatedBy: actor.userId,
      },
      include: {
        legacyDepositCompany: { select: { code: true, name: true } },
      },
    });

    await this.audit.record(actor, {
      entityType: 'Employee',
      entityId: employeeId,
      action: 'employee_deposit_settings_updated',
      before: {
        depositDeductionExempt: before.depositDeductionExempt,
      },
      after: {
        reason,
        depositDeductionExempt: updated.depositDeductionExempt,
      },
    });

    return resolveDepositProfile(updated);
  }

  private async maybeAutoExemptAtCap(
    actor: ActorContext,
    employeeId: string,
  ): Promise<void> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      select: { companyId: true },
    });
    if (!assignment) return;

    const rules = await this.depositRules.getRules(assignment.companyId);
    const totalBalance = await this.deposits.getRunningTotal(employeeId, assignment.companyId);
    if (totalBalance < rules.maximumBalanceAmount) return;

    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        depositDeductionExempt: true,
        updatedBy: actor.userId,
      },
    });
  }
}

function roundMoney(value: number): number {
  return Math.round(value * 100) / 100;
}
