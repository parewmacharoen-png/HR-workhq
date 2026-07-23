// ============================================================================
// modules/workflow/domain/entities/workflow.entity.ts
// The central approval engine's aggregate. A WorkflowInstance advances through
// ordered steps. Actions: approve / reject / return / escalate / override.
// Owner override can resolve from any step. Terminal states: approved/rejected/
// cancelled.
// ============================================================================

import {
  InvalidWorkflowTransitionError, WorkflowAlreadyResolvedError,
} from '../errors/workflow.errors';

export type WorkflowEntityType =
  | 'leave' | 'leave_reschedule' | 'leave_shift_swap'
  | 'attendance_correction' | 'overtime' | 'monthly_off' | 'payroll_adjustment'
  | 'bonus' | 'commission_adjustment' | 'deposit_refund' | 'advance'
  | 'performance_review' | 'employee_exit' | 'document_request';

export type InstanceStatus =
  | 'pending' | 'approved' | 'rejected' | 'returned' | 'escalated' | 'cancelled';

export type WorkflowActionType =
  | 'approve' | 'reject' | 'return' | 'escalate' | 'override' | 'cancel';

export interface StepDef {
  stepOrder: number;
  approverRule: 'sub_leader' | 'big_leader' | 'hr' | 'finance' | 'owner' | 'role' | 'direct_manager' | 'secretary' | 'any_owner';
  approverRoleId: string | null;
  allowEscalate: boolean;
}

export interface WorkflowInstanceProps {
  id: string;
  workflowDefinitionId: string;
  entityType: WorkflowEntityType;
  entityId: string;
  companyId: string | null;
  currentStepOrder: number;
  status: InstanceStatus;
  initiatedBy: string | null;
  deletedAt: Date | null;
}

const TERMINAL: InstanceStatus[] = ['approved', 'rejected', 'cancelled'];

export class WorkflowInstance {
  private constructor(
    private props: WorkflowInstanceProps,
    private readonly steps: StepDef[],
  ) {}

  static rehydrate(props: WorkflowInstanceProps, steps: StepDef[]): WorkflowInstance {
    return new WorkflowInstance(props, steps.sort((a, b) => a.stepOrder - b.stepOrder));
  }

  static start(input: {
    id: string;
    workflowDefinitionId: string;
    entityType: WorkflowEntityType;
    entityId: string;
    companyId: string | null;
    initiatedBy: string | null;
    steps: StepDef[];
  }): WorkflowInstance {
    const ordered = [...input.steps].sort((a, b) => a.stepOrder - b.stepOrder);
    return new WorkflowInstance(
      {
        id: input.id,
        workflowDefinitionId: input.workflowDefinitionId,
        entityType: input.entityType,
        entityId: input.entityId,
        companyId: input.companyId,
        currentStepOrder: ordered.length ? ordered[0].stepOrder : 1,
        status: 'pending',
        initiatedBy: input.initiatedBy,
        deletedAt: null,
      },
      ordered,
    );
  }

  get id(): string { return this.props.id; }
  get status(): InstanceStatus { return this.props.status; }
  get currentStepOrder(): number { return this.props.currentStepOrder; }
  get entityType(): WorkflowEntityType { return this.props.entityType; }
  get entityId(): string { return this.props.entityId; }
  get isResolved(): boolean { return TERMINAL.includes(this.props.status); }

  currentStep(): StepDef | null {
    return this.steps.find((s) => s.stepOrder === this.props.currentStepOrder) ?? null;
  }

  private assertActionable(action: WorkflowActionType): void {
    if (this.isResolved) throw new WorkflowAlreadyResolvedError();
    if (this.props.status === 'pending' || this.props.status === 'returned' || this.props.status === 'escalated') return;
    throw new InvalidWorkflowTransitionError(action, this.props.status);
  }

  /** Approve current step. If it's the last step, the workflow is approved. */
  approve(): void {
    this.assertActionable('approve');
    const next = this.steps.find((s) => s.stepOrder > this.props.currentStepOrder);
    if (next) {
      this.props.currentStepOrder = next.stepOrder;
      this.props.status = 'pending';
    } else {
      this.props.status = 'approved';
    }
  }

  reject(): void {
    this.assertActionable('reject');
    this.props.status = 'rejected';
  }

  /** Send back to the initiator for edits; stays open at step 1. */
  return(): void {
    this.assertActionable('return');
    this.props.status = 'returned';
    this.props.currentStepOrder = this.steps.length ? this.steps[0].stepOrder : 1;
  }

  /** Escalate to the next step without approving (if the step allows). */
  escalate(): void {
    this.assertActionable('escalate');
    const current = this.currentStep();
    if (current && !current.allowEscalate) {
      throw new InvalidWorkflowTransitionError('escalate', this.props.status);
    }
    const next = this.steps.find((s) => s.stepOrder > this.props.currentStepOrder);
    this.props.status = 'escalated';
    if (next) this.props.currentStepOrder = next.stepOrder;
  }

  /** Owner override: immediately resolve to the given terminal status. */
  override(to: 'approved' | 'rejected'): void {
    if (this.isResolved) throw new WorkflowAlreadyResolvedError();
    this.props.status = to;
  }

  cancel(): void {
    if (this.isResolved) throw new WorkflowAlreadyResolvedError();
    this.props.status = 'cancelled';
  }

  toPersistence(): WorkflowInstanceProps {
    return { ...this.props };
  }
}
