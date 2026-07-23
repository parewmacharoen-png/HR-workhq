// ============================================================================
// modules/leave/domain/entities/leave-request.entity.ts  (+ repo ports)
// ============================================================================

export type LeaveRequestStatus = 'pending' | 'approved' | 'rejected' | 'returned';

export interface LeaveRequestProps {
  id: string;
  employeeId: string;
  companyId: string;
  leaveTypeId: string;
  startDate: Date;
  endDate: Date;
  days: number;
  isBorrowed: boolean;
  reason: string | null;
  rescheduleCount: number;
  workflowInstanceId: string | null;
  status: LeaveRequestStatus;
  deletedAt: Date | null;
}

export class LeaveRequest {
  private constructor(private props: LeaveRequestProps) {}

  static rehydrate(props: LeaveRequestProps): LeaveRequest {
    return new LeaveRequest(props);
  }

  static create(input: {
    id: string;
    employeeId: string;
    companyId: string;
    leaveTypeId: string;
    startDate: Date;
    endDate: Date;
    days: number;
    isBorrowed: boolean;
    reason?: string | null;
  }): LeaveRequest {
    if (input.endDate < input.startDate) throw new Error('endDate before startDate');
    if (input.days <= 0) throw new Error('days must be > 0');
    return new LeaveRequest({
      ...input,
      reason: input.reason ?? null,
      rescheduleCount: 0,
      workflowInstanceId: null,
      status: 'pending',
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get status(): LeaveRequestStatus { return this.props.status; }

  attachWorkflow(instanceId: string): void {
    this.props.workflowInstanceId = instanceId;
  }

  markApproved(): void { this.props.status = 'approved'; }
  markRejected(): void { this.props.status = 'rejected'; }

  adminUpdate(input: {
    leaveTypeId?: string;
    startDate?: Date;
    endDate?: Date;
    days?: number;
    reason?: string | null;
  }): void {
    if (input.leaveTypeId) this.props.leaveTypeId = input.leaveTypeId;
    if (input.startDate) this.props.startDate = input.startDate;
    if (input.endDate) this.props.endDate = input.endDate;
    if (input.days != null) {
      if (input.days <= 0) throw new Error('days must be > 0');
      this.props.days = input.days;
    }
    if (input.reason !== undefined) this.props.reason = input.reason;
    if (this.props.endDate < this.props.startDate) throw new Error('endDate before startDate');
  }

  applyReschedule(newStartDate: Date, newEndDate: Date): void {
    if (this.props.status !== 'approved') throw new Error('Only approved leave can be rescheduled');
    if (newEndDate < newStartDate) throw new Error('endDate before startDate');
    this.props.startDate = newStartDate;
    this.props.endDate = newEndDate;
    this.props.rescheduleCount += 1;
  }

  swapDates(startDate: Date, endDate: Date): void {
    if (this.props.status !== 'approved') throw new Error('Only approved leave can be swapped');
    this.props.startDate = startDate;
    this.props.endDate = endDate;
  }

  toPersistence(): LeaveRequestProps {
    return { ...this.props };
  }
}
