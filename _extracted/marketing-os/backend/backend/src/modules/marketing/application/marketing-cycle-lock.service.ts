// ============================================================================
// MarketingCycleLockService — earn cycle lock/unlock for marketing back office
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { PayrollCycleResolverService } from '../../../shared/payroll/payroll-cycle-resolver.service';
import {
  MARKETING_CYCLE_LOCK_REPOSITORY,
  MarketingCycleLockRepository,
} from '../domain/repositories/marketing-cycle-lock.repository';
import {
  MARKETING_REPORT_AUDIT_REPOSITORY,
  MarketingReportAuditRepository,
} from '../domain/repositories/marketing-report-audit.repository';
import { CommissionCycleLockedError } from '../../commission/domain/errors/commission-finalization.errors';

@Injectable()
export class MarketingCycleLockService {
  constructor(
    @Inject(MARKETING_CYCLE_LOCK_REPOSITORY)
    private readonly locks: MarketingCycleLockRepository,
    @Inject(MARKETING_REPORT_AUDIT_REPOSITORY)
    private readonly auditRepo: MarketingReportAuditRepository,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly cycleResolver: PayrollCycleResolverService,
  ) {}

  async assertUnlockedForReportDate(companyId: string, reportDate: Date): Promise<void> {
    const earnCycleId = await this.cycleResolver.resolveEarnCycleId(companyId, reportDate);
    if (!earnCycleId) return;
    await this.assertUnlocked(companyId, earnCycleId);
  }

  async assertUnlocked(companyId: string, earnCycleId: string): Promise<void> {
    const lock = await this.locks.findByCompanyAndCycle(companyId, earnCycleId);
    if (lock?.status === 'locked') {
      throw new CommissionCycleLockedError(earnCycleId);
    }
    const commissionLock = await this.prisma.commissionCycle.findFirst({
      where: {
        companyId,
        earnCycleId,
        type: { in: ['marketing', 'admin'] },
        status: 'locked',
        deletedAt: null,
      },
    });
    if (commissionLock) {
      throw new CommissionCycleLockedError(earnCycleId);
    }
  }

  async isLocked(companyId: string, earnCycleId: string): Promise<boolean> {
    const lock = await this.locks.findByCompanyAndCycle(companyId, earnCycleId);
    return lock?.status === 'locked';
  }

  async lockCycle(
    actor: ActorContext,
    earnCycleId: string,
    lockReason: string,
    companyId?: string,
  ) {
    const resolvedCompanyId = companyId
      ?? await this.requireCycleCompanyId(actor, earnCycleId);
    await this.companyAccess.assertCompanyAccess(actor, resolvedCompanyId);
    await this.assertUnlocked(resolvedCompanyId, earnCycleId);

    const row = await this.locks.upsertLock({
      companyId: resolvedCompanyId,
      earnCycleId,
      lockedBy: actor.userId,
      lockReason,
    });

    return {
      id: row.id,
      companyId: row.companyId,
      earnCycleId: row.earnCycleId,
      status: row.status,
      lockedBy: row.lockedBy,
      lockedAt: row.lockedAt?.toISOString() ?? null,
      lockReason: row.lockReason,
    };
  }

  async unlockCycle(
    actor: ActorContext,
    earnCycleId: string,
    unlockReason: string,
    companyId?: string,
  ) {
    const resolvedCompanyId = companyId
      ?? await this.requireCycleCompanyId(actor, earnCycleId);
    await this.companyAccess.assertCompanyAccess(actor, resolvedCompanyId);

    const row = await this.locks.upsertUnlock({
      companyId: resolvedCompanyId,
      earnCycleId,
      unlockedBy: actor.userId,
      unlockReason,
    });

    return {
      id: row.id,
      companyId: row.companyId,
      earnCycleId: row.earnCycleId,
      status: row.status,
      unlockedBy: row.unlockedBy,
      unlockedAt: row.unlockedAt?.toISOString() ?? null,
      unlockReason: row.unlockReason,
    };
  }

  private async requireCycleCompanyId(actor: ActorContext, earnCycleId: string): Promise<string> {
    const cycle = await this.prisma.payrollCycle.findFirst({
      where: { id: earnCycleId, deletedAt: null },
      select: { companyId: true },
    });
    if (!cycle) throw new Error(`Earn cycle ${earnCycleId} not found`);
    return cycle.companyId;
  }
}
