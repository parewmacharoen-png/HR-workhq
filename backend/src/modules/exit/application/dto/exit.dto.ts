// ============================================================================
// modules/exit/application/dto/exit.dto.ts
// ============================================================================

import {
  IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';
import { ExitReason } from '../../domain/services/exit-reason-policy.service';
import {
  ExitCaseSourceType,
  ExitCaseType,
  ExitLifecycleStatus,
} from '../../domain/services/exit-lifecycle.mapper';

export class CreateExitCaseDto {
  @IsUUID()
  companyId!: string;

  @IsEnum([
    'proper_resignation', 'absconding', 'gross_misconduct',
    'performance_failure', 'constructive_resignation',
  ])
  exitReason!: ExitReason;

  @IsDateString()
  effectiveTerminationDate!: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(['manual', 'probation_review', 'disciplinary_action'])
  sourceType?: ExitCaseSourceType;

  @IsOptional()
  @IsUUID()
  sourceId?: string;
}

export class LeaderReviewDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class OwnerReviewDto {
  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateExitChecklistDto {
  @IsOptional()
  @IsBoolean()
  assetsReturned?: boolean;

  @IsOptional()
  @IsBoolean()
  debtsCleared?: boolean;

  @IsOptional()
  @IsBoolean()
  finalPayrollBuilt?: boolean;

  @IsOptional()
  @IsBoolean()
  accessRevoked?: boolean;
}

export class UpdateExitChecklistItemDto {
  @IsBoolean()
  completed!: boolean;
}

export class CloseExitCaseDto {
  @IsOptional()
  @IsDateString()
  terminationAt?: string;
}

export class CancelExitCaseDto {
  @IsString()
  cancellationReason!: string;
}

export class UpdateEmployeeDepositSettingsDto {
  @IsOptional()
  @IsBoolean()
  depositDeductionExempt?: boolean;

  /** @deprecated Prefer POST deposit/legacy to add per-company opening balances. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  legacyDepositAmount?: number | null;

  /** @deprecated Prefer POST deposit/legacy to add per-company opening balances. */
  @IsOptional()
  @IsUUID()
  legacyDepositCompanyId?: string | null;

  @IsString()
  reason!: string;
}

export class AddLegacyDepositDto {
  @IsUUID()
  companyId!: string;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  reason!: string;
}

export class UpdateDepositLedgerEntryDto {
  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  reason!: string;
}

export class DeleteDepositLedgerEntryDto {
  @IsString()
  reason!: string;
}

export interface ExitChecklistItemResponse {
  id: string;
  exitCaseId: string;
  itemKey: string;
  label: string;
  sortOrder: number;
  completed: boolean;
  completedBy: string | null;
  completedAt: string | null;
}

export interface ExitCaseResponse {
  id: string;
  employeeId: string;
  companyId: string;
  exitReason: ExitReason;
  exitType: ExitCaseType;
  lifecycleStatus: ExitLifecycleStatus;
  sourceType: ExitCaseSourceType;
  sourceId: string | null;
  status: string;
  departmentRoute: string;
  effectiveTerminationDate: string;
  assetsReturned: boolean;
  debtsCleared: boolean;
  finalPayrollBuilt: boolean;
  accessRevoked: boolean;
  pendingChecklistCount: number;
  depositBalanceAtExit: number | null;
  lossClaimTotal: number;
  refundAmount: number | null;
  forfeitAmount: number | null;
  legalReviewRequired: boolean;
  depositRefundId: string | null;
  leaderReviewedBy: string | null;
  leaderReviewedAt: string | null;
  leaderNotes: string | null;
  ownerReviewedBy: string | null;
  ownerReviewedAt: string | null;
  ownerNotes: string | null;
  notes: string | null;
  initiatedBy: string;
  settledAt: string | null;
  closedAt: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  cancellationReason: string | null;
  checklistItems?: ExitChecklistItemResponse[];
}

export interface ExitCaseSummaryRow {
  id: string;
  employeeId: string;
  employeeName: string;
  exitType: ExitCaseType;
  lifecycleStatus: ExitLifecycleStatus;
  status: string;
  effectiveTerminationDate: string;
  pendingChecklistCount: number;
  pendingItems?: string[];
  daysUntil?: number;
}

export interface ExitDashboardResponse {
  activeExitCases: ExitCaseSummaryRow[];
  pendingClearance: ExitCaseSummaryRow[];
  upcomingEffectiveDates: ExitCaseSummaryRow[];
}

export interface EmployeeExitHistoryResponse {
  activeCase: ExitCaseResponse | null;
  history: ExitCaseResponse[];
}

export interface SettlementPreviewResponse {
  depositBalance: number;
  collectorBreakdown: Array<{
    companyId: string;
    companyCode: string | null;
    companyName: string | null;
    collectedAmount: number;
    refundAmount: number;
  }>;
  approvedClaimsTotal: number;
  claims: Array<{
    id: string;
    amount: number;
    category: string;
    description: string;
    status: string;
    evidenceUrl?: string | null;
    approvedByOwner?: string | null;
    approvedAt?: string | null;
  }>;
  refundAmount: number;
  forfeitAmount: number;
  outcome: string;
  legalReviewRequired: boolean;
  policyRules: string[];
  claimShortfallWarning: number | null;
  ownerCaseByCase: boolean;
  unresolvedAssetCount: number;
  assetsBlockingSettlement: boolean;
}

export interface DepositBalanceResponse {
  employeeId: string;
  balance: number;
  ledgerBalance: number;
  refundableEstimate: number;
  depositDeductionExempt: boolean;
  legacyDepositAmount: number;
  legacyDepositCompanyId: string | null;
  legacyDepositCompanyCode: string | null;
  legacyDepositCompanyName: string | null;
  /** Individual pre-system deposit rows (one per company entry). */
  legacyEntries: Array<{
    id: string | null;
    companyId: string;
    companyCode: string | null;
    companyName: string | null;
    amount: number;
    source: 'profile' | 'ledger';
  }>;
  collectorBreakdown: Array<{
    companyId: string;
    companyCode: string | null;
    companyName: string | null;
    collectedAmount: number;
    isLegacy?: boolean;
  }>;
}

export interface DepositLedgerResponse {
  employeeId: string;
  entries: Array<{
    id: string;
    owningCompanyId: string;
    owningCompanyCode: string | null;
    owningCompanyName: string | null;
    payrollCycleId: string | null;
    isLegacy: boolean;
    amount: number;
    runningTotal: number;
    createdAt: string;
  }>;
}
