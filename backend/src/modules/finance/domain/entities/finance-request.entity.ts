// ============================================================================
// modules/finance/domain/entities/finance-request.entity.ts
// Two small aggregates over existing tables:
//   AdvanceRequest  – salary advance, workflow-gated, recovered via payroll
//   DepositRefund   – deposit refund, respects company ownership (non-transfer)
// Shared FinanceRequestStatus lifecycle.
// ============================================================================

import { InvalidAmountError } from '../errors/finance.errors';

export type FinanceRequestStatus =
  | 'pending' | 'approved' | 'rejected' | 'recovered' | 'refunded';

export interface AdvanceRequestProps {
  id: string;
  employeeId: string;
  companyId: string;
  amount: number;
  reason: string | null;
  workflowInstanceId: string | null;
  status: FinanceRequestStatus;
  recoveredPayrollItemId: string | null;
  deletedAt: Date | null;
}

export class AdvanceRequest {
  private constructor(private props: AdvanceRequestProps) {}

  static rehydrate(props: AdvanceRequestProps): AdvanceRequest {
    return new AdvanceRequest(props);
  }

  static create(input: {
    id: string; employeeId: string; companyId: string; amount: number; reason?: string | null;
  }): AdvanceRequest {
    if (input.amount <= 0) throw new InvalidAmountError();
    return new AdvanceRequest({
      id: input.id,
      employeeId: input.employeeId,
      companyId: input.companyId,
      amount: input.amount,
      reason: input.reason ?? null,
      workflowInstanceId: null,
      status: 'pending',
      recoveredPayrollItemId: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get status(): FinanceRequestStatus { return this.props.status; }
  get amount(): number { return this.props.amount; }
  get employeeId(): string { return this.props.employeeId; }
  get companyId(): string { return this.props.companyId; }

  attachWorkflow(id: string): void { this.props.workflowInstanceId = id; }
  approve(): void { this.props.status = 'approved'; }
  reject(): void { this.props.status = 'rejected'; }
  markRecovered(payrollItemId: string): void {
    this.props.status = 'recovered';
    this.props.recoveredPayrollItemId = payrollItemId;
  }

  toPersistence(): AdvanceRequestProps { return { ...this.props }; }
}

export interface DepositRefundProps {
  id: string;
  employeeId: string;
  owningCompanyId: string;
  amount: number;
  workflowInstanceId: string | null;
  status: FinanceRequestStatus;
  refundedPayrollItemId: string | null;
  deletedAt: Date | null;
}

export class DepositRefund {
  private constructor(private props: DepositRefundProps) {}

  static rehydrate(props: DepositRefundProps): DepositRefund {
    return new DepositRefund(props);
  }

  static create(input: {
    id: string; employeeId: string; owningCompanyId: string; amount: number;
  }): DepositRefund {
    if (input.amount <= 0) throw new InvalidAmountError();
    return new DepositRefund({
      id: input.id,
      employeeId: input.employeeId,
      owningCompanyId: input.owningCompanyId,
      amount: input.amount,
      workflowInstanceId: null,
      status: 'pending',
      refundedPayrollItemId: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get status(): FinanceRequestStatus { return this.props.status; }
  get owningCompanyId(): string { return this.props.owningCompanyId; }

  attachWorkflow(id: string): void { this.props.workflowInstanceId = id; }
  approve(): void { this.props.status = 'approved'; }
  reject(): void { this.props.status = 'rejected'; }
  markRefunded(payrollItemId: string): void {
    this.props.status = 'refunded';
    this.props.refundedPayrollItemId = payrollItemId;
  }

  toPersistence(): DepositRefundProps { return { ...this.props }; }
}
