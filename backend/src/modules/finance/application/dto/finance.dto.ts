// ============================================================================
// modules/finance/application/dto/finance.dto.ts
// ============================================================================

import {
  IsBoolean, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID,
  Length, Min,
} from 'class-validator';

// ── Cost Center ─────────────────────────────────────────────────────────────
export class CreateCostCenterDto {
  @IsUUID() companyId!: string;
  @IsString() @Length(1, 40) code!: string;
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() parentId?: string;
  @IsOptional() @IsUUID() ownerEmployeeId?: string;
}

export class UpdateCostCenterDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsUUID() ownerEmployeeId?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

// ── Budget ──────────────────────────────────────────────────────────────────
export class CreateBudgetDto {
  @IsUUID() companyId!: string;
  @IsString() @Length(1, 160) name!: string;
  @IsEnum(['monthly', 'quarterly', 'yearly'] as const) period!: 'monthly' | 'quarterly' | 'yearly';
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsUUID() costCenterId?: string;
}

export class AdjustBudgetDto {
  @IsNumber() @Min(0) amount!: number;
}

// ── Financial Transaction (Revenue / Expense) ────────────────────────────────
export class CreateTransactionDto {
  @IsUUID() companyId!: string;
  @IsEnum(['revenue', 'expense'] as const) type!: 'revenue' | 'expense';
  @IsNumber() @Min(0.01) amount!: number;
  @IsDateString() transactionDate!: string;
  @IsOptional() @IsUUID() costCenterId?: string;
  @IsOptional() @IsUUID() budgetId?: string;
  @IsOptional() @IsString() @Length(1, 80) category?: string;
  @IsOptional() @IsString() @Length(1, 8) currency?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() @Length(1, 200) counterparty?: string;
}

// ── Advance Request ──────────────────────────────────────────────────────────
export class CreateAdvanceDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsOptional() @IsString() reason?: string;
}

// ── Deposit Refund ───────────────────────────────────────────────────────────
export class CreateDepositRefundDto {
  @IsUUID() employeeId!: string;
  @IsUUID() owningCompanyId!: string;
  @IsNumber() @Min(0.01) amount!: number;
}

// ── Responses ────────────────────────────────────────────────────────────────
export interface CostCenterResponse {
  id: string; companyId: string; code: string; name: string;
  parentId: string | null; isActive: boolean;
}
export interface BudgetResponse {
  id: string; companyId: string; costCenterId: string | null; name: string;
  amount: number; consumed: number; remaining: number;
}
export interface TransactionResponse {
  id: string; companyId: string; type: string; status: string;
  amount: number; costCenterId: string | null; budgetId: string | null;
  workflowInstanceId: string | null;
}
export interface FinanceRequestResponse {
  id: string; status: string; workflowInstanceId: string | null;
}
export interface FinancialSummaryResponse {
  companyId: string; from: string; to: string;
  totalRevenue: number; totalExpense: number; net: number;
}
