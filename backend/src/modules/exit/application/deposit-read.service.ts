// ============================================================================
// modules/exit/application/deposit-read.service.ts
// PAY-004h–i — employee-wide deposit balance + collector ledger
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import {
  BUSINESS_PERMISSION_REPOSITORY,
  BusinessPermissionRepository,
} from '../../permission/domain/repositories/business-permission.repository';
import { DEPOSIT_REPOSITORY, DepositRepository } from '../../payroll/domain/repositories/payroll.repository';
import {
  mergeLegacyCollectorBreakdown,
  resolveDepositProfile,
  totalDepositBalance,
  type DepositProfileFields,
} from '../domain/services/deposit-profile.util';
import {
  DepositBalanceResponse,
  DepositLedgerResponse,
} from './dto/exit.dto';

@Injectable()
export class DepositReadService {
  constructor(
    @Inject(DEPOSIT_REPOSITORY) private readonly deposits: DepositRepository,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    @Inject(BUSINESS_PERMISSION_REPOSITORY) private readonly permissions: BusinessPermissionRepository,
  ) {}

  async getBalance(actor: ActorContext, employeeId: string): Promise<DepositBalanceResponse> {
    await this.assertEmployeeDepositAccess(actor, employeeId);
    const snapshot = await this.loadDepositSnapshot(employeeId);
    const mergedCollectors = mergeLegacyCollectorBreakdown(
      snapshot.collectorBreakdown,
      snapshot.profile,
    );
    const legacyEntries = this.buildLegacyEntries(snapshot);
    const legacyDepositAmount = legacyEntries.reduce((sum, row) => sum + row.amount, 0);

    return {
      employeeId,
      balance: snapshot.totalBalance,
      ledgerBalance: snapshot.ledgerBalance,
      refundableEstimate: snapshot.totalBalance,
      depositDeductionExempt: snapshot.profile.depositDeductionExempt,
      legacyDepositAmount,
      legacyDepositCompanyId: snapshot.profile.legacyDepositCompanyId,
      legacyDepositCompanyCode: snapshot.profile.legacyDepositCompanyCode,
      legacyDepositCompanyName: snapshot.profile.legacyDepositCompanyName,
      legacyEntries,
      collectorBreakdown: mergedCollectors,
    };
  }

  async getLedger(actor: ActorContext, employeeId: string): Promise<DepositLedgerResponse> {
    await this.assertEmployeeDepositAccess(actor, employeeId);
    const cycleStart = await this.resolveDepositCycleStart(employeeId);
    const entries = await this.deposits.getLedger(employeeId, cycleStart);
    return { employeeId, entries };
  }

  async loadDepositSnapshot(employeeId: string): Promise<{
    profile: DepositProfileFields;
    ledgerBalance: number;
    totalBalance: number;
    collectorBreakdown: Awaited<ReturnType<DepositRepository['getCollectorBreakdown']>>;
    ledgerEntries: Awaited<ReturnType<DepositRepository['getLedger']>>;
  }> {
    const cycleStart = await this.resolveDepositCycleStart(employeeId);
    const [employee, ledgerBalance, collectorBreakdown, ledgerEntries] = await Promise.all([
      this.prisma.employee.findFirst({
        where: { id: employeeId, deletedAt: null },
        select: {
          depositDeductionExempt: true,
          legacyDepositAmount: true,
          legacyDepositCompanyId: true,
          legacyDepositCompany: { select: { code: true, name: true } },
        },
      }),
      this.deposits.getEmployeeBalance(employeeId, cycleStart),
      this.deposits.getCollectorBreakdown(employeeId, cycleStart),
      this.deposits.getLedger(employeeId, cycleStart),
    ]);

    const profile = resolveDepositProfile(employee ?? {
      depositDeductionExempt: false,
      legacyDepositAmount: null,
      legacyDepositCompanyId: null,
    });

    return {
      profile,
      ledgerBalance,
      totalBalance: totalDepositBalance(ledgerBalance, profile),
      collectorBreakdown,
      ledgerEntries,
    };
  }

  private buildLegacyEntries(snapshot: {
    profile: DepositProfileFields;
    ledgerEntries: Awaited<ReturnType<DepositRepository['getLedger']>>;
  }): DepositBalanceResponse['legacyEntries'] {
    const entries: DepositBalanceResponse['legacyEntries'] = snapshot.ledgerEntries
      .filter((row) => row.isLegacy)
      .map((row) => ({
        id: row.id,
        companyId: row.owningCompanyId,
        companyCode: row.owningCompanyCode,
        companyName: row.owningCompanyName,
        amount: row.amount,
        source: 'ledger' as const,
      }));

    if (
      snapshot.profile.legacyDepositAmount > 0
      && snapshot.profile.legacyDepositCompanyId
    ) {
      entries.unshift({
        id: null,
        companyId: snapshot.profile.legacyDepositCompanyId,
        companyCode: snapshot.profile.legacyDepositCompanyCode,
        companyName: snapshot.profile.legacyDepositCompanyName,
        amount: snapshot.profile.legacyDepositAmount,
        source: 'profile',
      });
    }

    return entries;
  }

  async isDepositDeductionExempt(employeeId: string): Promise<boolean> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { depositDeductionExempt: true },
    });
    return employee?.depositDeductionExempt ?? false;
  }

  async resolveDepositCycleStart(employeeId: string): Promise<Date | undefined> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { hireDate: true, rehireOfEmployeeId: true },
    });
    if (!employee) return undefined;
    if (employee.rehireOfEmployeeId) {
      return employee.hireDate;
    }
    return undefined;
  }

  private async assertEmployeeDepositAccess(actor: ActorContext, employeeId: string): Promise<void> {
    const access = await this.permissions.findUserAccess(actor.userId);
    if (access?.employeeId === employeeId) return;

    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: { employeeId, effectiveTo: null, deletedAt: null },
      select: { companyId: true },
    });
    if (!assignment) return;
    await this.companyAccess.assertCompanyAccess(actor, assignment.companyId);
  }
}
