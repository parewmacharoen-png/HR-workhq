// ============================================================================
// modules/exit/domain/entities/employee-exit-case.entity.ts
// ============================================================================

import { ExitReason } from '../services/exit-reason-policy.service';

export type ExitCaseStatus =
  | 'draft'
  | 'pending_leader_review'
  | 'pending_owner_review'
  | 'pending_settlement'
  | 'settled'
  | 'closed'
  | 'cancelled';

export type ExitDepartmentRoute = 'marketing' | 'admin';

export interface EmployeeExitCaseProps {
  id: string;
  employeeId: string;
  companyId: string;
  exitReason: ExitReason;
  status: ExitCaseStatus;
  departmentRoute: ExitDepartmentRoute;
  effectiveTerminationDate: Date;
  assetsReturned: boolean;
  debtsCleared: boolean;
  finalPayrollBuilt: boolean;
  accessRevoked: boolean;
  depositBalanceAtExit: number | null;
  lossClaimTotal: number;
  refundAmount: number | null;
  forfeitAmount: number | null;
  legalReviewRequired: boolean;
  depositRefundId: string | null;
  leaderReviewedBy: string | null;
  leaderReviewedAt: Date | null;
  leaderNotes: string | null;
  ownerReviewedBy: string | null;
  ownerReviewedAt: Date | null;
  ownerNotes: string | null;
  notes: string | null;
  initiatedBy: string;
  settledAt: Date | null;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  deletedAt: Date | null;
}

const OPEN_STATUSES: ExitCaseStatus[] = [
  'draft', 'pending_leader_review', 'pending_owner_review', 'pending_settlement', 'settled',
];

export class EmployeeExitCase {
  private constructor(private props: EmployeeExitCaseProps) {}

  static create(input: {
    id: string;
    employeeId: string;
    companyId: string;
    exitReason: ExitReason;
    departmentRoute: ExitDepartmentRoute;
    effectiveTerminationDate: Date;
    initiatedBy: string;
    notes?: string | null;
    legalReviewRequired?: boolean;
  }): EmployeeExitCase {
    return new EmployeeExitCase({
      id: input.id,
      employeeId: input.employeeId,
      companyId: input.companyId,
      exitReason: input.exitReason,
      status: 'pending_leader_review',
      departmentRoute: input.departmentRoute,
      effectiveTerminationDate: input.effectiveTerminationDate,
      assetsReturned: false,
      debtsCleared: false,
      finalPayrollBuilt: false,
      accessRevoked: false,
      depositBalanceAtExit: null,
      lossClaimTotal: 0,
      refundAmount: null,
      forfeitAmount: null,
      legalReviewRequired: input.legalReviewRequired ?? input.exitReason === 'gross_misconduct',
      depositRefundId: null,
      leaderReviewedBy: null,
      leaderReviewedAt: null,
      leaderNotes: null,
      ownerReviewedBy: null,
      ownerReviewedAt: null,
      ownerNotes: null,
      notes: input.notes ?? null,
      initiatedBy: input.initiatedBy,
      settledAt: null,
      closedAt: null,
      cancelledAt: null,
      cancelledBy: null,
      cancellationReason: null,
      deletedAt: null,
    });
  }

  static rehydrate(props: EmployeeExitCaseProps): EmployeeExitCase {
    return new EmployeeExitCase(props);
  }

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get companyId(): string { return this.props.companyId; }
  get status(): ExitCaseStatus { return this.props.status; }
  get exitReason(): ExitReason { return this.props.exitReason; }
  get departmentRoute(): ExitDepartmentRoute { return this.props.departmentRoute; }
  get legalReviewRequired(): boolean { return this.props.legalReviewRequired; }

  isOpen(): boolean {
    return OPEN_STATUSES.includes(this.props.status);
  }

  approveLeader(actorUserId: string, notes: string | null, at: Date): void {
    if (this.props.status !== 'pending_leader_review') {
      throw new Error('Exit case is not awaiting leader review');
    }
    this.props.leaderReviewedBy = actorUserId;
    this.props.leaderReviewedAt = at;
    this.props.leaderNotes = notes;
    this.props.status = 'pending_owner_review';
  }

  approveOwner(actorUserId: string, notes: string | null, at: Date): void {
    if (this.props.status !== 'pending_owner_review') {
      throw new Error('Exit case is not awaiting owner review');
    }
    this.props.ownerReviewedBy = actorUserId;
    this.props.ownerReviewedAt = at;
    this.props.ownerNotes = notes;
    this.props.status = 'pending_settlement';
  }

  updateChecklist(input: Partial<Pick<EmployeeExitCaseProps,
    'assetsReturned' | 'debtsCleared' | 'finalPayrollBuilt' | 'accessRevoked'
  >>): void {
    if (input.assetsReturned !== undefined) this.props.assetsReturned = input.assetsReturned;
    if (input.debtsCleared !== undefined) this.props.debtsCleared = input.debtsCleared;
    if (input.finalPayrollBuilt !== undefined) this.props.finalPayrollBuilt = input.finalPayrollBuilt;
    if (input.accessRevoked !== undefined) this.props.accessRevoked = input.accessRevoked;
  }

  applySettlement(input: {
    depositBalance: number;
    lossClaimTotal: number;
    refundAmount: number;
    forfeitAmount: number;
    at: Date;
  }): void {
    if (this.props.status !== 'pending_settlement') {
      throw new Error('Exit case is not ready for settlement');
    }
    this.props.depositBalanceAtExit = input.depositBalance;
    this.props.lossClaimTotal = input.lossClaimTotal;
    this.props.refundAmount = input.refundAmount;
    this.props.forfeitAmount = input.forfeitAmount;
    this.props.settledAt = input.at;
    this.props.status = 'settled';
  }

  close(at: Date): void {
    if (this.props.status !== 'settled') {
      throw new Error('Exit case must be settled before closing');
    }
    this.props.closedAt = at;
    this.props.status = 'closed';
  }

  cancel(actorUserId: string, reason: string, at: Date): void {
    if (this.props.status === 'closed' || this.props.status === 'cancelled') {
      throw new Error('Exit case cannot be cancelled');
    }
    this.props.status = 'cancelled';
    this.props.cancelledAt = at;
    this.props.cancelledBy = actorUserId;
    this.props.cancellationReason = reason;
  }

  linkDepositRefund(refundId: string): void {
    this.props.depositRefundId = refundId;
  }

  toPersistence(): EmployeeExitCaseProps {
    return { ...this.props };
  }
}
