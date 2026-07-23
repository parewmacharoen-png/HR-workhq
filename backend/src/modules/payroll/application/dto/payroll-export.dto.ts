// ============================================================================
// modules/payroll/application/dto/payroll-export.dto.ts
// PAY-006
// ============================================================================

import { IsBoolean, IsOptional, IsUUID } from 'class-validator';

export type PayrollExportExceptionFlag =
  | 'missing_bank_account'
  | 'net_pay_non_positive'
  | 'pending_adjustment';

export interface PayrollExportComponentSnapshot {
  itemType: string;
  amount: number;
  note: string | null;
}

export interface PayrollExportItemResponse {
  id: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  department: string | null;
  teamName: string | null;
  bankName: string | null;
  bankAccountNo: string | null;
  bankAccountName: string | null;
  netPayAmount: number;
  payrollComponents: PayrollExportComponentSnapshot[];
  exportStatus: 'included' | 'exception' | 'excluded';
  exceptionFlags: PayrollExportExceptionFlag[];
}

export interface PayrollExportBatchResponse {
  id: string;
  payrollCycleId: string;
  companyId: string;
  exportedBy: string;
  exportedAt: string;
  status: 'completed' | 'cancelled';
  includedCount: number;
  exceptionCount: number;
  totalNetPayAmount: number;
  ownerConfirmedExceptions: boolean;
  ownerConfirmedBy: string | null;
  ownerConfirmedAt: string | null;
  regeneratedFromBatchId: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
  items: PayrollExportItemResponse[];
}

export interface PayrollExportPreviewResponse {
  cycleId: string;
  companyId: string;
  cycleStatus: string;
  canExport: boolean;
  blockedReason: string | null;
  includedCount: number;
  exceptionCount: number;
  totalNetPayAmount: number;
  items: PayrollExportItemResponse[];
  exceptions: PayrollExportItemResponse[];
}

export class CreatePayrollExportBatchDto {
  @IsOptional()
  @IsBoolean()
  confirmExceptions?: boolean;

  @IsOptional()
  @IsUUID()
  regenerateFromBatchId?: string;
}
