// ============================================================================
// modules/exit/application/dto/final-settlement.dto.ts
// PAY-005 / PAY-005c
// ============================================================================

import { IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

export type FinalSettlementStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'paid'
  | 'cancelled';

export type DepositSettlementStatus = 'preview_only' | 'settled' | 'not_applicable';

export class UpdateFinalSettlementDto {
  @IsOptional() @IsNumber() pendingBonusAmount?: number;
  @IsOptional() @IsNumber() otherAdjustmentAmount?: number;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
}

export interface FinalSettlementResponse {
  id: string;
  employeeId: string;
  exitCaseId: string;
  companyId: string;
  payrollCycleId: string | null;
  salaryProrateAmount: number;
  unpaidSalaryAmount: number;
  pendingOtAmount: number;
  pendingCommissionAmount: number;
  pendingBonusAmount: number;
  advanceDeductionAmount: number;
  equipmentDeductionAmount: number;
  penaltyDeductionAmount: number;
  depositReturnAmount: number;
  otherAdjustmentAmount: number;
  netPayableAmount: number;
  depositPreviewAmount: number;
  depositSettledAmount: number | null;
  depositSettlementStatus: DepositSettlementStatus;
  status: FinalSettlementStatus;
  createdBy: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  paidBy: string | null;
  paidAt: string | null;
  cancelledBy: string | null;
  cancelledAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Employee self-service view — paid settlements only; no internal approval fields. */
export interface EmployeePaidSettlementSummary {
  id: string;
  exitCaseId: string;
  paidAt: string;
  totalAdditions: number;
  totalDeductions: number;
  depositReturn: number;
  netPaidAmount: number;
  lines: {
    salaryProrateAmount: number;
    unpaidSalaryAmount: number;
    pendingOtAmount: number;
    pendingCommissionAmount: number;
    pendingBonusAmount: number;
    advanceDeductionAmount: number;
    equipmentDeductionAmount: number;
    penaltyDeductionAmount: number;
    otherAdjustmentAmount: number;
  };
}
