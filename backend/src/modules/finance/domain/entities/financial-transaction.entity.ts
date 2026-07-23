// ============================================================================
// modules/finance/domain/entities/financial-transaction.entity.ts
// A revenue or expense transaction. Lifecycle:
//   draft → pending (submit) → approved | rejected → posted (to ledger) | void
// Expenses may require approval workflow above a threshold; the service decides.
// Posting writes a ledger_entry (revenue=credit, expense=debit).
// ============================================================================

import {
  TransactionNotApprovableError, TransactionAlreadyPostedError, InvalidAmountError,
} from '../errors/finance.errors';

export type TransactionType = 'revenue' | 'expense';
export type TransactionStatus = 'draft' | 'pending' | 'approved' | 'rejected' | 'posted' | 'void';

export interface FinancialTransactionProps {
  id: string;
  companyId: string;
  costCenterId: string | null;
  budgetId: string | null;
  type: TransactionType;
  status: TransactionStatus;
  category: string | null;
  amount: number;
  currency: string;
  transactionDate: Date;
  description: string | null;
  counterparty: string | null;
  workflowInstanceId: string | null;
  ledgerEntryId: string | null;
  deletedAt: Date | null;
}

export class FinancialTransaction {
  private constructor(private props: FinancialTransactionProps) {}

  static rehydrate(props: FinancialTransactionProps): FinancialTransaction {
    return new FinancialTransaction(props);
  }

  static create(input: {
    id: string;
    companyId: string;
    type: TransactionType;
    amount: number;
    transactionDate: Date;
    costCenterId?: string | null;
    budgetId?: string | null;
    category?: string | null;
    currency?: string;
    description?: string | null;
    counterparty?: string | null;
  }): FinancialTransaction {
    if (input.amount <= 0) throw new InvalidAmountError();
    return new FinancialTransaction({
      id: input.id,
      companyId: input.companyId,
      costCenterId: input.costCenterId ?? null,
      budgetId: input.budgetId ?? null,
      type: input.type,
      status: 'draft',
      category: input.category ?? null,
      amount: input.amount,
      currency: input.currency ?? 'THB',
      transactionDate: input.transactionDate,
      description: input.description ?? null,
      counterparty: input.counterparty ?? null,
      workflowInstanceId: null,
      ledgerEntryId: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get companyId(): string { return this.props.companyId; }
  get type(): TransactionType { return this.props.type; }
  get status(): TransactionStatus { return this.props.status; }
  get amount(): number { return this.props.amount; }
  get costCenterId(): string | null { return this.props.costCenterId; }
  get budgetId(): string | null { return this.props.budgetId; }
  get isExpense(): boolean { return this.props.type === 'expense'; }
  get isRevenue(): boolean { return this.props.type === 'revenue'; }
  get isPosted(): boolean { return this.props.status === 'posted'; }

  submit(): void {
    if (this.props.status !== 'draft') {
      throw new TransactionNotApprovableError(this.props.status);
    }
    this.props.status = 'pending';
  }

  attachWorkflow(instanceId: string): void {
    this.props.workflowInstanceId = instanceId;
  }

  approve(): void {
    if (this.props.status !== 'pending' && this.props.status !== 'draft') {
      throw new TransactionNotApprovableError(this.props.status);
    }
    this.props.status = 'approved';
  }

  reject(): void {
    if (this.props.status !== 'pending' && this.props.status !== 'draft') {
      throw new TransactionNotApprovableError(this.props.status);
    }
    this.props.status = 'rejected';
  }

  /** Mark posted to the ledger and link the ledger entry. */
  post(ledgerEntryId: string): void {
    if (this.props.status === 'posted') throw new TransactionAlreadyPostedError();
    if (this.props.status !== 'approved') {
      throw new TransactionNotApprovableError(this.props.status);
    }
    this.props.status = 'posted';
    this.props.ledgerEntryId = ledgerEntryId;
  }

  void(): void {
    if (this.props.status === 'posted') throw new TransactionAlreadyPostedError();
    this.props.status = 'void';
  }

  /** Ledger direction implied by transaction type. */
  ledgerDirection(): 'credit' | 'debit' {
    return this.props.type === 'revenue' ? 'credit' : 'debit';
  }

  toPersistence(): FinancialTransactionProps {
    return { ...this.props };
  }
}
