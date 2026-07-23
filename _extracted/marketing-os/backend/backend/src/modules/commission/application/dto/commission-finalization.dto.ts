// ============================================================================
// modules/commission/application/dto/commission-finalization.dto.ts
// ============================================================================

import {
  CommissionCycleAuditRow,
  CommissionCycleRow,
  CommissionCycleType,
} from '../../domain/repositories/commission-finalization.repository';

export interface CommissionCycleResponse {
  id: string;
  companyId: string;
  earnCycleId: string;
  type: CommissionCycleType;
  teamId: string | null;
  sourceCycleId: string;
  status: CommissionCycleRow['status'];
  approvedBy: string | null;
  approvedAt: string | null;
  finalizedBy: string | null;
  finalizedAt: string | null;
  lockedBy: string | null;
  lockedAt: string | null;
  totalCommission: number;
  totalRecipients: number;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionCycleAuditResponse {
  id: string;
  action: CommissionCycleAuditRow['action'];
  userId: string;
  beforeStatus: CommissionCycleRow['status'] | null;
  afterStatus: CommissionCycleRow['status'];
  metadata: unknown;
  createdAt: string;
}

export interface CommissionCyclePreviewResponse {
  cycle: CommissionCycleResponse;
  totals: {
    totalCommission: number;
    totalRecipients: number;
    carryForward: number;
    recovery: number;
    bigLeaderCommission: number;
  };
  recipients: Array<{
    employeeId: string;
    amount: number;
    carryForwardIn?: number;
    carryForwardOut?: number;
    status?: string;
  }>;
  carryForwards: Array<{
    employeeId: string;
    amount: number;
    status: string;
  }>;
}

export function toCommissionCycleResponse(row: CommissionCycleRow): CommissionCycleResponse {
  return {
    id: row.id,
    companyId: row.companyId,
    earnCycleId: row.earnCycleId,
    type: row.type,
    teamId: row.teamId,
    sourceCycleId: row.sourceCycleId,
    status: row.status,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    finalizedBy: row.finalizedBy,
    finalizedAt: row.finalizedAt?.toISOString() ?? null,
    lockedBy: row.lockedBy,
    lockedAt: row.lockedAt?.toISOString() ?? null,
    totalCommission: row.totalCommission,
    totalRecipients: row.totalRecipients,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCommissionCycleAuditResponse(row: CommissionCycleAuditRow): CommissionCycleAuditResponse {
  return {
    id: row.id,
    action: row.action,
    userId: row.userId,
    beforeStatus: row.beforeStatus,
    afterStatus: row.afterStatus,
    metadata: row.metadata,
    createdAt: row.createdAt.toISOString(),
  };
}
