// ============================================================================
// modules/attendance/domain/entities/absence-record.entity.ts
// ============================================================================

export type AbsenceRecordStatus = 'flagged' | 'approved' | 'waived' | 'disputed';
export type AbsenceRoleLevel = 'employee' | 'sub_leader' | 'big_leader';

export interface AbsenceRecordProps {
  id: string;
  employeeId: string;
  companyId: string;
  workDate: Date;
  status: AbsenceRecordStatus;
  roleLevelSnapshot: AbsenceRoleLevel | null;
  positionSnapshot: string | null;
  penaltyAmount: number | null;
  contactAttemptedAt: Date | null;
  contactNotes: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  waivedBy: string | null;
  waivedAt: Date | null;
  waiveReason: string | null;
  disputeReason: string | null;
  disputedAt: Date | null;
  resolvedBy: string | null;
  resolvedAt: Date | null;
  payrollItemId: string | null;
  flaggedReason: string;
  deletedAt: Date | null;
}

export class AbsenceRecord {
  private constructor(private props: AbsenceRecordProps) {}

  static create(input: {
    id: string;
    employeeId: string;
    companyId: string;
    workDate: Date;
    flaggedReason: string;
  }): AbsenceRecord {
    return new AbsenceRecord({
      id: input.id,
      employeeId: input.employeeId,
      companyId: input.companyId,
      workDate: input.workDate,
      status: 'flagged',
      roleLevelSnapshot: null,
      positionSnapshot: null,
      penaltyAmount: null,
      contactAttemptedAt: null,
      contactNotes: null,
      approvedBy: null,
      approvedAt: null,
      waivedBy: null,
      waivedAt: null,
      waiveReason: null,
      disputeReason: null,
      disputedAt: null,
      resolvedBy: null,
      resolvedAt: null,
      payrollItemId: null,
      flaggedReason: input.flaggedReason,
      deletedAt: null,
    });
  }

  static rehydrate(props: AbsenceRecordProps): AbsenceRecord {
    return new AbsenceRecord(props);
  }

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get companyId(): string { return this.props.companyId; }
  get workDate(): Date { return this.props.workDate; }
  get status(): AbsenceRecordStatus { return this.props.status; }
  get payrollItemId(): string | null { return this.props.payrollItemId; }

  approve(input: {
    actorUserId: string;
    at: Date;
    contactAttemptedAt: Date;
    contactNotes: string;
    roleLevelSnapshot: AbsenceRoleLevel;
    positionSnapshot: string | null;
    penaltyAmount: number;
  }): void {
    if (this.props.status === 'approved') {
      throw new Error('Absence already approved');
    }
    if (this.props.payrollItemId) {
      throw new Error('Absence linked to payroll');
    }
    this.props.status = 'approved';
    this.props.approvedBy = input.actorUserId;
    this.props.approvedAt = input.at;
    this.props.contactAttemptedAt = input.contactAttemptedAt;
    this.props.contactNotes = input.contactNotes;
    this.props.roleLevelSnapshot = input.roleLevelSnapshot;
    this.props.positionSnapshot = input.positionSnapshot;
    this.props.penaltyAmount = input.penaltyAmount;
    this.props.disputeReason = null;
    this.props.disputedAt = null;
    this.props.resolvedBy = null;
    this.props.resolvedAt = null;
  }

  waive(input: { actorUserId: string; at: Date; reason: string }): void {
    if (this.props.payrollItemId) {
      throw new Error('Absence linked to payroll');
    }
    this.props.status = 'waived';
    this.props.waivedBy = input.actorUserId;
    this.props.waivedAt = input.at;
    this.props.waiveReason = input.reason;
    this.props.penaltyAmount = null;
  }

  /** Re-open a waived absence for manager review (e.g. time correction rejected). */
  restoreFlagged(): void {
    if (this.props.status !== 'waived') {
      throw new Error('Only waived absences can be restored');
    }
    if (this.props.payrollItemId) {
      throw new Error('Absence linked to payroll');
    }
    this.props.status = 'flagged';
    this.props.waivedBy = null;
    this.props.waivedAt = null;
    this.props.waiveReason = null;
  }

  dispute(input: { at: Date; reason: string }): void {
    if (this.props.status !== 'approved' && this.props.status !== 'flagged') {
      throw new Error('Only flagged or approved absences can be disputed');
    }
    this.props.status = 'disputed';
    this.props.disputeReason = input.reason;
    this.props.disputedAt = input.at;
  }

  resolveDispute(input: {
    actorUserId: string;
    at: Date;
    outcome: 'approved' | 'waived';
    contactAttemptedAt?: Date;
    contactNotes?: string;
    roleLevelSnapshot?: AbsenceRoleLevel;
    positionSnapshot?: string | null;
    penaltyAmount?: number;
    waiveReason?: string;
  }): void {
    if (this.props.status !== 'disputed') {
      throw new Error('Only disputed absences can be resolved');
    }
    this.props.resolvedBy = input.actorUserId;
    this.props.resolvedAt = input.at;
    if (input.outcome === 'waived') {
      this.waive({ actorUserId: input.actorUserId, at: input.at, reason: input.waiveReason ?? 'Dispute resolved — waived' });
      return;
    }
    this.approve({
      actorUserId: input.actorUserId,
      at: input.at,
      contactAttemptedAt: input.contactAttemptedAt ?? input.at,
      contactNotes: input.contactNotes ?? this.props.contactNotes ?? 'Dispute resolved — approved',
      roleLevelSnapshot: input.roleLevelSnapshot ?? this.props.roleLevelSnapshot ?? 'employee',
      positionSnapshot: input.positionSnapshot ?? this.props.positionSnapshot,
      penaltyAmount: input.penaltyAmount ?? this.props.penaltyAmount ?? 0,
    });
  }

  toPersistence(): AbsenceRecordProps {
    return { ...this.props };
  }
}
