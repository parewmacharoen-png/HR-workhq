// ============================================================================
// modules/finance/domain/entities/budget.entity.ts
// A spending budget for a cost center over a period. Tracks consumed amount;
// the domain enforces that consumption never exceeds the budget unless the
// caller explicitly allows overspend.
// ============================================================================

import { BudgetExceededError } from '../errors/finance.errors';

export type BudgetPeriod = 'monthly' | 'quarterly' | 'yearly';

export interface BudgetProps {
  id: string;
  companyId: string;
  costCenterId: string | null;
  name: string;
  period: BudgetPeriod;
  periodStart: Date;
  periodEnd: Date;
  amount: number;
  consumed: number;
  deletedAt: Date | null;
}

export class Budget {
  private constructor(private props: BudgetProps) {}

  static rehydrate(props: BudgetProps): Budget {
    return new Budget(props);
  }

  static create(input: {
    id: string;
    companyId: string;
    name: string;
    period: BudgetPeriod;
    periodStart: Date;
    periodEnd: Date;
    amount: number;
    costCenterId?: string | null;
  }): Budget {
    if (input.periodEnd < input.periodStart) throw new Error('periodEnd before periodStart');
    if (input.amount < 0) throw new Error('Budget amount cannot be negative');
    return new Budget({
      id: input.id,
      companyId: input.companyId,
      costCenterId: input.costCenterId ?? null,
      name: input.name.trim(),
      period: input.period,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      amount: input.amount,
      consumed: 0,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get companyId(): string { return this.props.companyId; }
  get costCenterId(): string | null { return this.props.costCenterId; }
  get amount(): number { return this.props.amount; }
  get consumed(): number { return this.props.consumed; }
  get remaining(): number { return this.props.amount - this.props.consumed; }

  /** Whether a given expense fits within the remaining budget. */
  canAccommodate(expense: number): boolean {
    return this.remaining >= expense;
  }

  /** Apply an expense to the budget. Throws if it would overspend unless allowOverspend. */
  consume(expense: number, allowOverspend = false): void {
    if (expense < 0) throw new Error('Cannot consume a negative amount');
    if (!allowOverspend && !this.canAccommodate(expense)) {
      throw new BudgetExceededError();
    }
    this.props.consumed = this.round2(this.props.consumed + expense);
  }

  /** Release a previously consumed amount (e.g. a transaction was voided). */
  release(amount: number): void {
    this.props.consumed = this.round2(Math.max(0, this.props.consumed - amount));
  }

  adjustAmount(newAmount: number): void {
    if (newAmount < 0) throw new Error('Budget amount cannot be negative');
    this.props.amount = newAmount;
  }

  private round2(n: number): number {
    return Math.round(n * 100) / 100;
  }

  toPersistence(): BudgetProps {
    return { ...this.props };
  }
}
