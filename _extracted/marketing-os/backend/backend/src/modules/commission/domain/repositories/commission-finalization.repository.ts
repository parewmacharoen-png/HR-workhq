// ============================================================================
// modules/commission/domain/repositories/commission-finalization.repository.ts
// ============================================================================

export const COMMISSION_FINALIZATION_REPOSITORY = Symbol('COMMISSION_FINALIZATION_REPOSITORY');

export type CommissionCycleType = 'marketing' | 'admin' | 'referral' | 'recruitment';
export type CommissionCycleStatus = 'draft' | 'approved' | 'finalized' | 'locked';
export type CommissionCycleAuditAction = 'approve' | 'finalize' | 'lock';

export interface CommissionCycleRow {
  id: string;
  companyId: string;
  earnCycleId: string;
  type: CommissionCycleType;
  teamId: string | null;
  sourceCycleId: string;
  status: CommissionCycleStatus;
  approvedBy: string | null;
  approvedAt: Date | null;
  finalizedBy: string | null;
  finalizedAt: Date | null;
  lockedBy: string | null;
  lockedAt: Date | null;
  totalCommission: number;
  totalRecipients: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionCycleAuditRow {
  id: string;
  commissionCycleId: string;
  action: CommissionCycleAuditAction;
  userId: string;
  beforeStatus: CommissionCycleStatus | null;
  afterStatus: CommissionCycleStatus;
  metadata: unknown;
  createdAt: Date;
}

export interface UpsertCommissionCycleInput {
  companyId: string;
  earnCycleId: string;
  type: CommissionCycleType;
  teamId?: string | null;
  sourceCycleId: string;
  totalCommission: number;
  totalRecipients: number;
  status?: CommissionCycleStatus;
  actorUserId: string;
}

export interface CommissionFinalizationRepository {
  findById(id: string): Promise<CommissionCycleRow | null>;
  findBySource(type: CommissionCycleType, sourceCycleId: string): Promise<CommissionCycleRow | null>;
  list(filters: {
    companyId: string;
    earnCycleId?: string;
    type?: CommissionCycleType;
    status?: CommissionCycleStatus;
  }): Promise<CommissionCycleRow[]>;
  upsertFromCalculation(input: UpsertCommissionCycleInput): Promise<CommissionCycleRow>;
  updateStatus(
    id: string,
    input: {
      status: CommissionCycleStatus;
      actorUserId: string;
      approvedBy?: string;
      approvedAt?: Date;
      finalizedBy?: string;
      finalizedAt?: Date;
      lockedBy?: string;
      lockedAt?: Date;
      totalCommission?: number;
      totalRecipients?: number;
    },
  ): Promise<CommissionCycleRow>;
  createAudit(input: {
    commissionCycleId: string;
    action: CommissionCycleAuditAction;
    userId: string;
    beforeStatus: CommissionCycleStatus | null;
    afterStatus: CommissionCycleStatus;
    metadata?: unknown;
  }): Promise<CommissionCycleAuditRow>;
  listAudits(commissionCycleId: string): Promise<CommissionCycleAuditRow[]>;
  isEarnCycleLocked(companyId: string, earnCycleId: string): Promise<boolean>;
  isMarketingTeamCycleLocked(companyId: string, earnCycleId: string, teamId: string): Promise<boolean>;
}
