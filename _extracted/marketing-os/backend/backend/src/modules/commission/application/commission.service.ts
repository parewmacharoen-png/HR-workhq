// ============================================================================
// modules/commission/application/commission.service.ts
// Full commission lifecycle. Called by a payroll-cycle job for each employee:
//   1. accrueForCycle  – record candidate count vs target, compute gross
//   2. processHolds    – apply hold/redistribute logic across the team
//   3. finalizeForCycle– move qualified 'accrued' → 'paid', attach payroll item
//   4. processBigLeader– compute carry-forward ledger entry
// Split commission is handled separately via splitCommission().
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import {
  COMMISSION_REPOSITORY, BIG_LEADER_LEDGER_REPOSITORY,
  CommissionRepository, BigLeaderLedgerRepository,
} from '../domain/repositories/commission.repository';
import { CommissionQualificationService } from '../domain/services/commission-qualification.service';
import {
  CommissionRecordNotFoundError, CommissionAlreadyFinalizedError,
  SplitRatioMustSumToOneError, BigLeaderLedgerExistsError,
} from '../domain/errors/commission.errors';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { RecruitmentService } from '../../recruitment/application/recruitment.service';
import { CommissionAdjustmentService } from './commission-adjustment.service';

const COMMISSION_TARGET_DEFAULT = 24;

@Injectable()
export class CommissionService {
  private readonly qualification = new CommissionQualificationService();

  constructor(
    @Inject(COMMISSION_REPOSITORY)      private readonly repo: CommissionRepository,
    @Inject(BIG_LEADER_LEDGER_REPOSITORY) private readonly ledger: BigLeaderLedgerRepository,
    private readonly audit: AuditService,
    private readonly recruitment: RecruitmentService,
    private readonly commissionAdjustments: CommissionAdjustmentService,
  ) {}

  // ── 1. Accrue ─────────────────────────────────────────────────────────────

  async accrueForCycle(actor: ActorContext, input: {
    employeeId: string;
    companyId: string;
    earnCycleId: string;
    achievedCandidates: number;
    grossAmount: number;
    targetValue?: number;
  }): Promise<{ id: string; qualified: boolean }> {
    const target = input.targetValue ?? COMMISSION_TARGET_DEFAULT;
    const qualified = this.qualification.qualifies({ achieved: input.achievedCandidates, target });

    const id = await this.repo.create({
      employeeId: input.employeeId,
      companyId: input.companyId,
      earnCycleId: input.earnCycleId,
      payCycleId: null,         // assigned one cycle later
      achievedValue: input.achievedCandidates,
      targetValue: target,
      qualified,
      grossAmount: input.grossAmount,
      status: 'accrued',
      payrollItemId: null,
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'CommissionRecord', entityId: id, action: 'accrue',
      after: { qualified, grossAmount: input.grossAmount, achieved: input.achievedCandidates },
    });
    return { id, qualified };
  }

  /**
   * Accrue commission for a recruiter by fetching the unique candidate count
   * directly from the recruitment module — no manual count needed from the caller.
   * The grossAmount must still be provided (it depends on payroll configuration
   * that the commission module does not own).
   */
  async accrueForRecruiter(actor: ActorContext, input: {
    employeeId: string;
    companyId: string;
    earnCycleId: string;
    grossAmount: number;
    targetValue?: number;
  }): Promise<{ id: string; qualified: boolean; achievedCandidates: number }> {
    // Fetch real unique candidate count from recruitment module
    const { count: achievedCandidates } = await this.recruitment.getUniqueCandidateCount(
      input.employeeId,
      input.earnCycleId,
    );

    const { id, qualified } = await this.accrueForCycle(actor, {
      ...input,
      achievedCandidates,
    });

    return { id, qualified, achievedCandidates };
  }

  // ── 2. Process holds / redistribution ────────────────────────────────────

  async processAfterCycle(actor: ActorContext, input: {
    commissionRecordId: string;
    currentCycleId: string;
    redistributeToTeamId: string;
  }): Promise<{ verdict: string }> {
    const record = await this.repo.findById(input.commissionRecordId);
    if (!record) throw new CommissionRecordNotFoundError(input.commissionRecordId);
    if (record.status !== 'accrued') throw new CommissionAlreadyFinalizedError();

    const existingHold = await this.repo.findPendingHoldForEmployee(record.employeeId, record.companyId);
    const verdict = this.qualification.verdictAfterHold({
      currentQualified: record.qualified,
      wasOnHold: !!existingHold,
    });

    switch (verdict) {
      case 'qualified':
        if (existingHold) {
          await this.repo.resolveHold(existingHold.id, 'released', input.currentCycleId, actor.userId);
        }
        // Leave status as 'accrued'; finalize step attaches pay cycle + item.
        break;

      case 'hold':
        await this.repo.createHold({
          commissionRecordId: record.id,
          holdCycleId: input.currentCycleId,
        }, actor.userId);
        await this.repo.updateStatus(record.id, 'hold', null, actor.userId);
        break;

      case 'redistribute': {
        const holdId = existingHold?.id ?? null;
        if (holdId) await this.repo.resolveHold(holdId, 'redistributed', input.currentCycleId, actor.userId);
        await this.repo.createRedistribution({
          sourceRecordId: record.id,
          sourceHoldId: holdId,
          toTeamId: input.redistributeToTeamId,
          toEmployeeId: null,
          amount: record.grossAmount,
          redistributedCycleId: input.currentCycleId,
        }, actor.userId);
        await this.repo.updateStatus(record.id, 'redistributed', null, actor.userId);
        break;
      }
    }

    await this.audit.record(actor, {
      entityType: 'CommissionRecord', entityId: record.id,
      action: `commission_${verdict}`, after: { verdict },
    });
    return { verdict };
  }

  // ── 3. Finalize (attach to payroll item one cycle behind) ─────────────────

  async finalizeForCycle(actor: ActorContext, input: {
    commissionRecordId: string;
    payCycleId: string;
    payrollItemId: string;
  }): Promise<void> {
    const record = await this.repo.findById(input.commissionRecordId);
    if (!record) throw new CommissionRecordNotFoundError(input.commissionRecordId);
    if (record.status !== 'accrued') throw new CommissionAlreadyFinalizedError();

    await this.repo.updateStatus(record.id, 'paid', input.payCycleId, actor.userId);
    await this.audit.record(actor, {
      entityType: 'CommissionRecord', entityId: record.id, action: 'finalize',
      after: { payCycleId: input.payCycleId, payrollItemId: input.payrollItemId },
    });
  }

  // ── Split commission ──────────────────────────────────────────────────────

  async splitCommission(actor: ActorContext, input: {
    commissionRecordId: string;
    splits: Array<{ employeeId: string; shareRatio: number }>;
  }): Promise<void> {
    const record = await this.repo.findById(input.commissionRecordId);
    if (!record) throw new CommissionRecordNotFoundError(input.commissionRecordId);

    const total = input.splits.reduce((s, x) => s + x.shareRatio, 0);
    if (Math.abs(total - 1) > 0.0001) throw new SplitRatioMustSumToOneError();

    const splitRows = input.splits.map((s) => ({
      commissionRecordId: record.id,
      employeeId: s.employeeId,
      shareRatio: s.shareRatio,
      amount: Math.round(record.grossAmount * s.shareRatio * 100) / 100,
    }));
    await this.repo.createSplits(splitRows, actor.userId);
    await this.audit.record(actor, {
      entityType: 'CommissionRecord', entityId: record.id, action: 'split',
      after: { splits: splitRows },
    });
  }

  // ── Workflow integration ──────────────────────────────────────────────────

  /** Outbox handler: delegates to CommissionAdjustmentService (entityId = adjustment request id). */
  async onCommissionAdjustmentWorkflowResolved(
    entityId: string,
    status: 'approved' | 'rejected' | 'cancelled',
  ): Promise<void> {
    await this.commissionAdjustments.onWorkflowResolved(entityId, status);
  }

  // ── Big-leader ledger ─────────────────────────────────────────────────────

  async processBigLeader(actor: ActorContext, input: {
    employeeId: string;
    companyId: string;
    cycleId: string;
    earned: number;
  }): Promise<{ closingCarry: number; payout: number }> {
    const existing = await this.ledger.findForCycle(input.employeeId, input.companyId, input.cycleId);
    if (existing) throw new BigLeaderLedgerExistsError();

    const openingCarry = await this.ledger.getLastClosingCarry(input.employeeId, input.companyId);
    const { closing, payout } = this.qualification.bigLeaderClosing(openingCarry, input.earned);

    await this.ledger.create({
      employeeId: input.employeeId,
      companyId: input.companyId,
      cycleId: input.cycleId,
      openingCarry,
      earned: input.earned,
      closingCarry: closing,
      payrollItemId: null,
    }, actor.userId);

    await this.audit.record(actor, {
      entityType: 'BigLeaderLedger', entityId: input.cycleId, action: 'process',
      after: { openingCarry, earned: input.earned, closingCarry: closing, payout },
    });
    return { closingCarry: closing, payout };
  }
}
