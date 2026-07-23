// ============================================================================
// modules/payroll/domain/repositories/payroll.repository.ts
// ============================================================================

import { PayrollCycle } from '../entities/payroll-cycle.entity';

export const PAYROLL_CYCLE_REPOSITORY = Symbol('PAYROLL_CYCLE_REPOSITORY');
export const PAYROLL_ITEM_REPOSITORY  = Symbol('PAYROLL_ITEM_REPOSITORY');
export const PAYSLIP_REPOSITORY       = Symbol('PAYSLIP_REPOSITORY');
export const SALARY_REPOSITORY        = Symbol('SALARY_REPOSITORY');
export const DEPOSIT_REPOSITORY       = Symbol('DEPOSIT_REPOSITORY');

export type PayrollItemType =
  | 'salary' | 'ot' | 'meal_allowance' | 'cross_border'
  | 'bonus' | 'leave_bonus' | 'late_deduction' | 'absence_deduction' | 'excess_off_deduction' | 'break_deduction' | 'consecutive_leave_deduction' | 'commission' | 'referral' | 'deposit'
  | 'manual_adjustment';

export interface PayrollItemRow {
  id: string;
  payrollCycleId: string;
  employeeId: string;
  companyId: string;
  itemType: PayrollItemType;
  amount: number;      // positive=credit, negative=debit (e.g. deposit)
  quantity: number | null;
  sourceRefType: string | null;
  sourceRefId: string | null;
  note: string | null;
}

export interface PayslipRow {
  id: string;
  payrollCycleId: string;
  employeeId: string;
  gross: number;
  deductions: number;
  net: number;
  breakdown: Record<string, number>;
}

export interface SalaryBandRow {
  monthlySalary: number;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export interface DepositSummary {
  runningTotal: number;
}

export interface PayrollCycleRepository {
  findById(id: string): Promise<PayrollCycle | null>;
  findActiveForCompany(companyId: string): Promise<PayrollCycle | null>;
  existsForCompanyPeriod(companyId: string, periodStart: Date): Promise<boolean>;
  save(cycle: PayrollCycle, actorUserId: string): Promise<void>;
}

export interface PayrollItemRepository {
  listByCycle(cycleId: string): Promise<PayrollItemRow[]>;
  listByCycleAndEmployee(cycleId: string, employeeId: string): Promise<PayrollItemRow[]>;
  findById(id: string): Promise<PayrollItemRow | null>;
  create(item: Omit<PayrollItemRow, 'id'>, actorUserId: string): Promise<string>;
  update(
    id: string,
    data: { amount: number; note: string | null; quantity?: number | null },
    actorUserId: string,
  ): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface PayslipRepository {
  findByCycleAndEmployee(cycleId: string, employeeId: string): Promise<PayslipRow | null>;
  create(row: Omit<PayslipRow, 'id'>, actorUserId: string): Promise<string>;
}

export interface SalaryRepository {
  getBandsInPeriod(employeeId: string, companyId: string, from: Date, to: Date): Promise<SalaryBandRow[]>;
}

export interface DepositLedgerEntry {
  id: string;
  employeeId: string;
  owningCompanyId: string;
  owningCompanyCode: string | null;
  owningCompanyName: string | null;
  payrollCycleId: string | null;
  /** True when recorded as pre-system / manual opening balance (no payroll cycle). */
  isLegacy: boolean;
  amount: number;
  runningTotal: number;
  createdAt: string;
}

export interface CollectorBreakdownEntry {
  companyId: string;
  companyCode: string | null;
  companyName: string | null;
  collectedAmount: number;
  /** True when every ledger row for this company is a pre-system entry. */
  isLegacy?: boolean;
}

export interface DepositRepository {
  /** Employee-wide balance (PAY-004h) — optional cycle start (hire date for rehire). */
  getEmployeeBalance(employeeId: string, cycleStart?: Date): Promise<number>;
  /**
   * Balance used for payroll cap checks: ledger + legacy pre-system deposit.
   * When this reaches maximumBalanceAmount, monthly payroll deduction stops.
   */
  getRunningTotal(employeeId: string, companyId: string): Promise<number>;
  getLedger(employeeId: string, cycleStart?: Date): Promise<DepositLedgerEntry[]>;
  getCollectorBreakdown(employeeId: string, cycleStart?: Date): Promise<CollectorBreakdownEntry[]>;
  create(input: {
    employeeId: string;
    companyId: string;
    cycleId: string | null;
    amount: number;
  }, actorUserId: string): Promise<string>;
  softDelete(depositId: string, actorUserId: string): Promise<{
    employeeId: string;
    payrollCycleId: string | null;
    amount: number;
  } | null>;
  updateAmount(depositId: string, amount: number, actorUserId: string): Promise<DepositLedgerEntry | null>;
  recalculateRunningTotals(employeeId: string): Promise<void>;
}
