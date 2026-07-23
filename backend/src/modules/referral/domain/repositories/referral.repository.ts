// ============================================================================
// modules/referral/domain/repositories/referral.repository.ts
// ============================================================================

import { ReferralEntity } from '../entities/referral.entity';
import type { DuplicateSignal } from '../services/duplicate-detection.service';

export const REFERRAL_REPOSITORY           = Symbol('REFERRAL_REPOSITORY');
export const DUPLICATE_CHECK_REPOSITORY    = Symbol('DUPLICATE_CHECK_REPOSITORY');
export const REFERRAL_EMPLOYEE_REPOSITORY  = Symbol('REFERRAL_EMPLOYEE_REPOSITORY');
export const REFERRAL_PAYROLL_REPOSITORY   = Symbol('REFERRAL_PAYROLL_REPOSITORY');
export const REFERRAL_ANALYTICS_REPOSITORY = Symbol('REFERRAL_ANALYTICS_REPOSITORY');

export type ReferralStatus = 'pending' | 'qualified' | 'paid' | 'rejected';

export interface ReferralFilters {
  companyId?: string;
  referrerEmployeeId?: string;
  status?: ReferralStatus;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

export interface ReferralRepository {
  findById(id: string): Promise<ReferralEntity | null>;
  findByReferredEmployee(referredEmployeeId: string): Promise<ReferralEntity | null>;
  list(filters: ReferralFilters): Promise<ReferralEntity[]>;
  save(referral: ReferralEntity, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface DuplicateCheckRecord {
  referralId: string;
  checkedBy: string | null;
  signal: DuplicateSignal;
  matchFound: boolean;
  matchDetail: string | null;
}

export interface DuplicateCheckRepository {
  /** Append an immutable duplicate check result. */
  append(record: DuplicateCheckRecord): Promise<void>;
  /** All checks for a referral, in order. */
  listByReferral(referralId: string): Promise<Array<DuplicateCheckRecord & { checkedAt: Date }>>;
}

export interface ReferredEmployeeData {
  id: string;
  hireDate: Date;
  employmentStatus: 'probation' | 'active' | 'suspended' | 'terminated';
  probationEndDate: Date | null;
  nationalId: string | null;   // still encrypted; service must decrypt before use
  phone: string | null;
  bankAccountNo: string | null;  // primary bank account_no (encrypted)
}

export interface ReferralEmployeeRepository {
  /** Fetch the data needed for qualification + duplicate checks. */
  getForReferral(employeeId: string): Promise<ReferredEmployeeData | null>;
  /** All bank account numbers for an employee (encrypted; caller must decrypt). */
  getBankAccounts(employeeId: string): Promise<string[]>;
  /**
   * Check whether any OTHER employee (excluding excludeEmployeeId) shares the
   * given value for the specified signal field.
   * Returns true = duplicate found.
   */
  checkDuplicateSignal(
    signal: DuplicateSignal,
    value: string,
    excludeEmployeeId: string,
  ): Promise<boolean>;
}

export interface ReferralPayrollRepository {
  /** Create a referral payroll item on the open cycle for the referrer. */
  createReferralPayrollItem(input: {
    referrerEmployeeId: string;
    companyId: string;
    amount: number;
    referralId: string;
    actorUserId: string;
  }): Promise<string>;
}

// ── Analytics ─────────────────────────────────────────────────────────────────
export interface ReferralSummary {
  total: number;
  pending: number;
  qualified: number;
  paid: number;
  rejected: number;
  totalRewardPaid: number;
  totalRewardPending: number;
}

export interface ReferrerLeaderboardEntry {
  referrerEmployeeId: string;
  referralCount: number;
  qualifiedCount: number;
  paidCount: number;
  totalEarned: number;
}

export interface ReferralAnalyticsRepository {
  summary(companyId: string, from?: Date, to?: Date): Promise<ReferralSummary>;
  leaderboard(companyId: string, limit: number): Promise<ReferrerLeaderboardEntry[]>;
  pendingQualification(companyId: string): Promise<ReferralEntity[]>;
}
