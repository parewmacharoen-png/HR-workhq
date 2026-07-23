// ============================================================================
// modules/marketing/domain/repositories/marketing-expense.repository.ts
// ============================================================================

export const MARKETING_EXPENSE_REPOSITORY = Symbol('MARKETING_EXPENSE_REPOSITORY');

export type MarketingExpenseCategory =
  | 'advertising'
  | 'deposit'
  | 'worker_payment'
  | 'worker_bonus'
  | 'team_operation'
  | 'shared_expense'
  | 'line_oa'
  | 'telesales'
  | 'promotion'
  | 'other';

export type MarketingExpenseStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'voided';

export interface MarketingExpenseRow {
  id: string;
  companyId: string;
  teamId: string | null;
  employeeId: string | null;
  earnCycleId: string;
  expenseDate: Date;
  category: MarketingExpenseCategory;
  subCategory: string | null;
  amount: number;
  description: string | null;
  attachmentUrl: string | null;
  status: MarketingExpenseStatus;
  submittedBy: string | null;
  approvedBy: string | null;
  approvedAt: Date | null;
  rejectedReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateMarketingExpenseInput {
  companyId: string;
  teamId?: string | null;
  employeeId?: string | null;
  earnCycleId: string;
  expenseDate: Date;
  category: MarketingExpenseCategory;
  subCategory?: string | null;
  amount: number;
  description?: string | null;
  attachmentUrl?: string | null;
  actorUserId: string;
}

export interface UpdateMarketingExpenseInput {
  teamId?: string | null;
  employeeId?: string | null;
  expenseDate?: Date;
  category?: MarketingExpenseCategory;
  subCategory?: string | null;
  amount?: number;
  description?: string | null;
  attachmentUrl?: string | null;
  actorUserId: string;
}

export interface MarketingExpenseListFilters {
  companyId: string;
  teamId?: string;
  employeeId?: string;
  earnCycleId?: string;
  status?: MarketingExpenseStatus;
  category?: MarketingExpenseCategory;
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
}

export interface CommissionExpenseTotals {
  marketingExpense: number;
  lineExpense: number;
  telesalesExpense: number;
  promotionExpense: number;
}

export interface MarketingExpenseRepository {
  create(input: CreateMarketingExpenseInput): Promise<MarketingExpenseRow>;
  update(id: string, input: UpdateMarketingExpenseInput): Promise<MarketingExpenseRow>;
  findById(id: string): Promise<MarketingExpenseRow | null>;
  list(filters: MarketingExpenseListFilters): Promise<MarketingExpenseRow[]>;
  saveStatus(
    id: string,
    status: MarketingExpenseStatus,
    actorUserId: string,
    meta?: {
      submittedBy?: string | null;
      approvedBy?: string | null;
      approvedAt?: Date | null;
      rejectedReason?: string | null;
    },
  ): Promise<MarketingExpenseRow>;
  sumApprovedAmount(filters: Omit<MarketingExpenseListFilters, 'status' | 'limit'>): Promise<number>;
  aggregateCommissionTotals(
    companyId: string,
    teamId: string,
    earnCycleId: string,
  ): Promise<CommissionExpenseTotals>;
  aggregateApprovedByCategory(
    filters: Omit<MarketingExpenseListFilters, 'status' | 'limit'>,
  ): Promise<Record<MarketingExpenseCategory, number>>;
}
