// ============================================================================
// modules/commission/domain/repositories/commission.repository.ts
// ============================================================================

export const COMMISSION_REPOSITORY = Symbol('COMMISSION_REPOSITORY');
export const BIG_LEADER_LEDGER_REPOSITORY = Symbol('BIG_LEADER_LEDGER_REPOSITORY');

export type CommissionStatus = 'accrued' | 'hold' | 'redistributed' | 'paid';

export interface CommissionRecordRow {
  id: string;
  employeeId: string;
  companyId: string;
  earnCycleId: string;
  payCycleId: string | null;
  achievedValue: number;
  targetValue: number;
  qualified: boolean;
  grossAmount: number;
  status: CommissionStatus;
  payrollItemId: string | null;
}

export interface HoldRow {
  id: string;
  commissionRecordId: string;
  holdCycleId: string;
  resolution: 'released' | 'redistributed' | 'pending';
  resolvedCycleId: string | null;
}

export interface SplitInput {
  commissionRecordId: string;
  employeeId: string;
  shareRatio: number;
  amount: number;
}

export interface CommissionRepository {
  findById(id: string): Promise<CommissionRecordRow | null>;
  findForEmployeeCycle(employeeId: string, earnCycleId: string): Promise<CommissionRecordRow | null>;
  findPendingHoldForEmployee(employeeId: string, companyId: string): Promise<HoldRow | null>;
  create(record: Omit<CommissionRecordRow, 'id'>, actorUserId: string): Promise<string>;
  updateStatus(id: string, status: CommissionStatus, payCycleId: string | null, actorUserId: string): Promise<void>;
  createHold(input: { commissionRecordId: string; holdCycleId: string }, actorUserId: string): Promise<string>;
  resolveHold(holdId: string, resolution: 'released' | 'redistributed', resolvedCycleId: string, actorUserId: string): Promise<void>;
  createRedistribution(input: {
    sourceRecordId: string;
    sourceHoldId: string | null;
    toTeamId: string;
    toEmployeeId: string | null;
    amount: number;
    redistributedCycleId: string;
  }, actorUserId: string): Promise<void>;
  createSplits(splits: SplitInput[], actorUserId: string): Promise<void>;
}

export interface BigLeaderLedgerRow {
  id: string;
  employeeId: string;
  companyId: string;
  cycleId: string;
  openingCarry: number;
  earned: number;
  closingCarry: number;
  payrollItemId: string | null;
}

export interface BigLeaderLedgerRepository {
  findForCycle(employeeId: string, companyId: string, cycleId: string): Promise<BigLeaderLedgerRow | null>;
  getLastClosingCarry(employeeId: string, companyId: string): Promise<number>;
  create(row: Omit<BigLeaderLedgerRow, 'id'>, actorUserId: string): Promise<string>;
  attachPayrollItem(id: string, payrollItemId: string): Promise<void>;
}
