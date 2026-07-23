// ============================================================================
// modules/commission/application/dto/commission-adjustment.dto.ts
// ============================================================================

import {
  CommissionAdjustmentAuditRow,
  CommissionAdjustmentEntryRow,
  CommissionAdjustmentRow,
} from '../../domain/repositories/commission-adjustment.repository';

export interface CommissionAdjustmentResponse {
  id: string;
  companyId: string;
  earnCycleId: string;
  commissionCycleId: string;
  type: CommissionAdjustmentRow['type'];
  teamId: string | null;
  employeeId: string;
  sourceResultId: string | null;
  reason: string;
  adjustmentAmount: number;
  direction: CommissionAdjustmentRow['direction'];
  status: CommissionAdjustmentRow['status'];
  workflowInstanceId: string | null;
  submittedBy: string | null;
  submittedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  appliedBy: string | null;
  appliedAt: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommissionAdjustmentAuditResponse {
  id: string;
  action: CommissionAdjustmentAuditRow['action'];
  userId: string;
  beforeStatus: CommissionAdjustmentRow['status'] | null;
  afterStatus: CommissionAdjustmentRow['status'];
  metadata: unknown;
  createdAt: string;
}

export interface CommissionAdjustmentEntryResponse {
  id: string;
  adjustmentRequestId: string;
  employeeId: string;
  sourceResultId: string;
  sourceResultType: CommissionAdjustmentEntryRow['sourceResultType'];
  originalAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  payrollItemId: string | null;
  createdAt: string;
}

export function toCommissionAdjustmentResponse(row: CommissionAdjustmentRow): CommissionAdjustmentResponse {
  return {
    id: row.id,
    companyId: row.companyId,
    earnCycleId: row.earnCycleId,
    commissionCycleId: row.commissionCycleId,
    type: row.type,
    teamId: row.teamId,
    employeeId: row.employeeId,
    sourceResultId: row.sourceResultId,
    reason: row.reason,
    adjustmentAmount: row.adjustmentAmount,
    direction: row.direction,
    status: row.status,
    workflowInstanceId: row.workflowInstanceId,
    submittedBy: row.submittedBy,
    submittedAt: row.submittedAt?.toISOString() ?? null,
    approvedBy: row.approvedBy,
    approvedAt: row.approvedAt?.toISOString() ?? null,
    appliedBy: row.appliedBy,
    appliedAt: row.appliedAt?.toISOString() ?? null,
    rejectedBy: row.rejectedBy,
    rejectedAt: row.rejectedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export function toCommissionAdjustmentAuditResponse(row: CommissionAdjustmentAuditRow): CommissionAdjustmentAuditResponse {
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

export function toCommissionAdjustmentEntryResponse(row: CommissionAdjustmentEntryRow): CommissionAdjustmentEntryResponse {
  return {
    id: row.id,
    adjustmentRequestId: row.adjustmentRequestId,
    employeeId: row.employeeId,
    sourceResultId: row.sourceResultId,
    sourceResultType: row.sourceResultType,
    originalAmount: row.originalAmount,
    adjustmentAmount: row.adjustmentAmount,
    netAmount: row.netAmount,
    payrollItemId: row.payrollItemId,
    createdAt: row.createdAt.toISOString(),
  };
}
