import { apiGet, apiPatch, apiPost } from './client';

export type FinalSettlementStatus =
  | 'draft'
  | 'pending_review'
  | 'approved'
  | 'paid'
  | 'cancelled';

export type DepositSettlementStatus = 'preview_only' | 'settled' | 'not_applicable';

export interface FinalSettlementRecord {
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

export interface UpdateFinalSettlementInput {
  pendingBonusAmount?: number;
  otherAdjustmentAmount?: number;
  notes?: string;
}

export function createFinalSettlementDraft(exitCaseId: string): Promise<FinalSettlementRecord> {
  return apiPost<FinalSettlementRecord>(`/exit-cases/${exitCaseId}/final-settlement/draft`, {});
}

export function fetchFinalSettlement(exitCaseId: string): Promise<FinalSettlementRecord> {
  return apiGet<FinalSettlementRecord>(`/exit-cases/${exitCaseId}/final-settlement`);
}

export function fetchEmployeePaidSettlementSummary(
  employeeId: string,
): Promise<EmployeePaidSettlementSummary> {
  return apiGet<EmployeePaidSettlementSummary>(`/employees/${employeeId}/final-settlement/paid-summary`);
}

export function updateFinalSettlement(
  id: string,
  input: UpdateFinalSettlementInput,
): Promise<FinalSettlementRecord> {
  return apiPatch<FinalSettlementRecord>(`/final-settlements/${id}`, input);
}

export function recalculateFinalSettlement(id: string): Promise<FinalSettlementRecord> {
  return apiPost<FinalSettlementRecord>(`/final-settlements/${id}/recalculate`, {});
}

export function submitFinalSettlement(id: string): Promise<FinalSettlementRecord> {
  return apiPost<FinalSettlementRecord>(`/final-settlements/${id}/submit`, {});
}

export function approveFinalSettlement(id: string): Promise<FinalSettlementRecord> {
  return apiPost<FinalSettlementRecord>(`/final-settlements/${id}/approve`, {});
}

export function markFinalSettlementPaid(id: string): Promise<FinalSettlementRecord> {
  return apiPost<FinalSettlementRecord>(`/final-settlements/${id}/mark-paid`, {});
}

export function cancelFinalSettlement(id: string): Promise<FinalSettlementRecord> {
  return apiPost<FinalSettlementRecord>(`/final-settlements/${id}/cancel`, {});
}
