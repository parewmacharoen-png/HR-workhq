// ============================================================================
// modules/referral/application/dto/referral.dto.ts
// ============================================================================

import {
  IsBoolean, IsDateString, IsEnum, IsInt,
  IsOptional, IsString, IsUUID, Max, Min,
} from 'class-validator';

// ── Commands ──────────────────────────────────────────────────────────────────
export class RegisterReferralDto {
  @IsUUID() referrerEmployeeId!: string;
  @IsUUID() referredEmployeeId!: string;
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() candidateId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class QualifyReferralDto {
  /** Override duplicate block — only HR / Owner may set this. */
  @IsOptional() @IsBoolean() overrideDuplicateBlock?: boolean;
  /** Override the eligibility check (e.g. early manual qualification). */
  @IsOptional() @IsBoolean() overrideEligibility?: boolean;
  @IsOptional() @IsString() notes?: string;
}

export class RejectReferralDto {
  @IsOptional() @IsString() reason?: string;
}

// ── Queries ───────────────────────────────────────────────────────────────────
export class ListReferralsQuery {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() referrerEmployeeId?: string;
  @IsOptional() @IsEnum(['pending','qualified','paid','rejected'] as const)
  status?: 'pending' | 'qualified' | 'paid' | 'rejected';
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
}

export class DashboardQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
}

// ── Responses ─────────────────────────────────────────────────────────────────
export interface ReferralResponse {
  id: string;
  referrerEmployeeId: string;
  referredEmployeeId: string;
  companyId: string;
  candidateId: string | null;
  rewardAmount: number;
  status: string;
  qualifyingCondition: string | null;
  qualifiedAt: string | null;
  payrollItemId: string | null;
  notes: string | null;
  rejectionReason: string | null;
}

export interface DuplicateCheckResponse {
  signal: string;
  matchFound: boolean;
  matchDetail: string | null;
  checkedAt: string;
}

export interface EligibilityCheckResponse {
  qualified: boolean;
  condition: string | null;
  qualifiedAt: string | null;
  reason: string | null;
}

export interface ReferralDashboardResponse {
  summary: {
    total: number;
    pending: number;
    qualified: number;
    paid: number;
    rejected: number;
    totalRewardPaid: number;
    totalRewardPending: number;
  };
  leaderboard: Array<{
    referrerEmployeeId: string;
    referralCount: number;
    qualifiedCount: number;
    paidCount: number;
    totalEarned: number;
  }>;
  pendingQualification: ReferralResponse[];
}
