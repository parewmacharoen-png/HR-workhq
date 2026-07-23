// ============================================================================
// modules/commission/domain/repositories/commission-adjustment.repository.ts
// ============================================================================

import { CommissionCycleType } from './commission-finalization.repository';

export const COMMISSION_ADJUSTMENT_REPOSITORY = Symbol('COMMISSION_ADJUSTMENT_REPOSITORY');

export type CommissionAdjustmentStatus = 'draft' | 'submitted' | 'approved' | 'rejected' | 'applied';
export type CommissionAdjustmentDirection = 'increase' | 'decrease';
export type CommissionAdjustmentSourceType = 'marketing_member' | 'admin_member' | 'recruitment_record' | 'referral';
export type CommissionAdjustmentAuditAction = 'submit' | 'approve' | 'reject' | 'apply';

export interface CommissionAdjustmentRow {
  id: string;
  companyId: string;
  earnCycleId: string;
  commissionCycleId: string;
  type: CommissionCycleType;
  teamId: string | null;
  employeeId: string;
  sourceResultId: string | null;
  reason: string;
  adjustmentAmount: number;
  direction: CommissionAdjustmentDirection;
  status: CommissionAdjustmentStatus;
  workflowInstanceId: string | null;
  submittedBy: string | null;
  submittedAt: Date | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  appliedBy: string | null;
  appliedAt: Date | null;
  rejectedBy: string | null;
  rejectedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CommissionAdjustmentEntryRow {
  id: string;
  adjustmentRequestId: string;
  employeeId: string;
  sourceResultId: string;
  sourceResultType: CommissionAdjustmentSourceType;
  originalAmount: number;
  adjustmentAmount: number;
  netAmount: number;
  payrollItemId: string | null;
  createdAt: Date;
}

export interface CommissionAdjustmentAuditRow {
  id: string;
  adjustmentRequestId: string;
  action: CommissionAdjustmentAuditAction;
  userId: string;
  beforeStatus: CommissionAdjustmentStatus | null;
  afterStatus: CommissionAdjustmentStatus;
  metadata: unknown;
  createdAt: Date;
}

export interface CreateCommissionAdjustmentInput {
  companyId: string;
  earnCycleId: string;
  commissionCycleId: string;
  type: CommissionCycleType;
  teamId?: string | null;
  employeeId: string;
  sourceResultId?: string | null;
  reason: string;
  adjustmentAmount: number;
  direction: CommissionAdjustmentDirection;
  actorUserId: string;
}

export interface CommissionAdjustmentRepository {
  findById(id: string): Promise<CommissionAdjustmentRow | null>;
  list(filters: {
    companyId: string;
    earnCycleId?: string;
    type?: CommissionCycleType;
    employeeId?: string;
    status?: CommissionAdjustmentStatus;
  }): Promise<CommissionAdjustmentRow[]>;
  create(input: CreateCommissionAdjustmentInput): Promise<CommissionAdjustmentRow>;
  updateStatus(
    id: string,
    input: {
      status: CommissionAdjustmentStatus;
      actorUserId: string;
      workflowInstanceId?: string | null;
      submittedBy?: string;
      submittedAt?: Date;
      approvedBy?: string;
      approvedAt?: Date;
      appliedBy?: string;
      appliedAt?: Date;
      rejectedBy?: string;
      rejectedAt?: Date;
    },
  ): Promise<CommissionAdjustmentRow>;
  createEntry(input: {
    adjustmentRequestId: string;
    employeeId: string;
    sourceResultId: string;
    sourceResultType: CommissionAdjustmentSourceType;
    originalAmount: number;
    adjustmentAmount: number;
    netAmount: number;
    payrollItemId?: string | null;
    actorUserId: string;
  }): Promise<CommissionAdjustmentEntryRow>;
  findEntryByRequest(adjustmentRequestId: string): Promise<CommissionAdjustmentEntryRow | null>;
  listEntries(filters: { companyId: string; earnCycleId?: string; employeeId?: string }): Promise<CommissionAdjustmentEntryRow[]>;
  createAudit(input: {
    adjustmentRequestId: string;
    action: CommissionAdjustmentAuditAction;
    userId: string;
    beforeStatus: CommissionAdjustmentStatus | null;
    afterStatus: CommissionAdjustmentStatus;
    metadata?: unknown;
  }): Promise<CommissionAdjustmentAuditRow>;
  listAudits(adjustmentRequestId: string): Promise<CommissionAdjustmentAuditRow[]>;
  findPayrollItemBySource(sourceRefId: string): Promise<string | null>;
  createPayrollItem(input: {
    payCycleId: string;
    employeeId: string;
    companyId: string;
    amount: number;
    sourceRefId: string;
    note: string;
    actorUserId: string;
  }): Promise<string>;
}
