// ============================================================================
// modules/finance/domain/repositories/finance.repository.ts
// ============================================================================

import { CostCenter } from '../entities/cost-center.entity';
import { Budget } from '../entities/budget.entity';
import { FinancialTransaction } from '../entities/financial-transaction.entity';
import { AdvanceRequest, DepositRefund } from '../entities/finance-request.entity';
import { LedgerEntryDraft } from '../services/finance-posting.service';

export const COST_CENTER_REPOSITORY      = Symbol('COST_CENTER_REPOSITORY');
export const BUDGET_REPOSITORY           = Symbol('BUDGET_REPOSITORY');
export const FINANCIAL_TXN_REPOSITORY    = Symbol('FINANCIAL_TXN_REPOSITORY');
export const LEDGER_REPOSITORY           = Symbol('LEDGER_REPOSITORY');
export const ADVANCE_REQUEST_REPOSITORY  = Symbol('ADVANCE_REQUEST_REPOSITORY');
export const DEPOSIT_REFUND_REPOSITORY   = Symbol('DEPOSIT_REFUND_REPOSITORY');

export interface CostCenterRepository {
  findById(id: string): Promise<CostCenter | null>;
  findByCompanyAndCode(companyId: string, code: string): Promise<CostCenter | null>;
  listByCompany(companyId: string): Promise<CostCenter[]>;
  save(cc: CostCenter, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface BudgetRepository {
  findById(id: string): Promise<Budget | null>;
  findActiveForCostCenter(companyId: string, costCenterId: string, onDate: Date): Promise<Budget | null>;
  listByCompany(companyId: string): Promise<Budget[]>;
  save(budget: Budget, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface RevenueExpenseSummary {
  totalRevenue: number;
  totalExpense: number;
  net: number;
}

export interface FinancialTransactionRepository {
  findById(id: string): Promise<FinancialTransaction | null>;
  listByCompany(companyId: string, from: Date, to: Date): Promise<FinancialTransaction[]>;
  findByWorkflowEntity(entityId: string): Promise<FinancialTransaction | null>;
  save(txn: FinancialTransaction, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
  summary(companyId: string, from: Date, to: Date): Promise<RevenueExpenseSummary>;
}

export interface LedgerRepository {
  create(draft: LedgerEntryDraft, actorUserId: string): Promise<string>;
}

export interface AdvanceRequestRepository {
  findById(id: string): Promise<AdvanceRequest | null>;
  findByWorkflowEntity(entityId: string): Promise<AdvanceRequest | null>;
  save(req: AdvanceRequest, actorUserId: string): Promise<void>;
}

export interface DepositRefundRepository {
  findById(id: string): Promise<DepositRefund | null>;
  findByWorkflowEntity(entityId: string): Promise<DepositRefund | null>;
  save(req: DepositRefund, actorUserId: string): Promise<void>;
}
