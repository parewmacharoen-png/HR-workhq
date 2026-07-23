// ============================================================================
// modules/finance/domain/services/finance-posting.service.ts
// Pure rules for finance posting:
//   * Whether a transaction needs an approval workflow (amount threshold).
//   * The ledger entry derived from a posted transaction.
// Thresholds are injectable so the Formula Engine can override per company /
// effective date later.
// ============================================================================

import { FinancialTransaction } from '../entities/financial-transaction.entity';

export interface PostingParams {
  /** Expenses at/above this amount require an approval workflow. */
  expenseApprovalThreshold: number;
  /** Revenue at/above this amount requires an approval workflow. */
  revenueApprovalThreshold: number;
}

export const DEFAULT_POSTING_PARAMS: PostingParams = {
  expenseApprovalThreshold: 10000, // ฿10k expenses need approval
  revenueApprovalThreshold: Number.POSITIVE_INFINITY, // revenue auto-approves by default
};

export interface LedgerEntryDraft {
  companyId: string;
  entryDate: Date;
  account: string;
  direction: 'credit' | 'debit';
  amount: number;
  refType: string;
  refId: string;
  description: string | null;
}

export class FinancePostingService {
  constructor(private readonly params: PostingParams = DEFAULT_POSTING_PARAMS) {}

  /** Does this transaction require an approval workflow before posting? */
  requiresApproval(txn: FinancialTransaction): boolean {
    const threshold = txn.isExpense
      ? this.params.expenseApprovalThreshold
      : this.params.revenueApprovalThreshold;
    return txn.amount >= threshold;
  }

  /** Build the ledger entry for a transaction being posted. */
  toLedgerEntry(txn: FinancialTransaction): LedgerEntryDraft {
    const p = txn.toPersistence();
    return {
      companyId: p.companyId,
      entryDate: p.transactionDate,
      account: p.category ?? (txn.isRevenue ? 'revenue' : 'expense'),
      direction: txn.ledgerDirection(),
      amount: p.amount,
      refType: 'financial_transaction',
      refId: p.id,
      description: p.description,
    };
  }
}
