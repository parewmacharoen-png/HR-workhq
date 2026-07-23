// ============================================================================
// modules/marketing/application/dto/marketing-expense.dto.ts
// ============================================================================

import {
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Min,
} from 'class-validator';
import { MarketingExpenseCategory } from '../../domain/repositories/marketing-expense.repository';

const CATEGORIES: MarketingExpenseCategory[] = [
  'advertising',
  'deposit',
  'worker_payment',
  'worker_bonus',
  'team_operation',
  'shared_expense',
  'line_oa',
  'telesales',
  'promotion',
  'other',
];

export class CreateMarketingExpenseDto {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
  @IsDateString() expenseDate!: string;
  @IsEnum(CATEGORIES) category!: MarketingExpenseCategory;
  @IsOptional() @IsString() subCategory?: string;
  @IsNumber() @Min(0) amount!: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsString() attachmentUrl?: string;
}

export class UpdateMarketingExpenseDto {
  @IsOptional() @IsUUID() teamId?: string | null;
  @IsOptional() @IsUUID() employeeId?: string | null;
  @IsOptional() @IsDateString() expenseDate?: string;
  @IsOptional() @IsEnum(CATEGORIES) category?: MarketingExpenseCategory;
  @IsOptional() @IsString() subCategory?: string | null;
  @IsOptional() @IsNumber() @Min(0) amount?: number;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() attachmentUrl?: string | null;
}

export class RejectMarketingExpenseDto {
  @IsString() reason!: string;
}

export class VoidMarketingExpenseDto {
  @IsOptional() @IsString() reason?: string;
}

export class ListMarketingExpensesQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
  @IsOptional() @IsString() status?: string;
  @IsOptional() @IsEnum(CATEGORIES) category?: MarketingExpenseCategory;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export class MarketingExpenseSummaryQuery {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() employeeId?: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
  @IsOptional() @IsDateString() dateFrom?: string;
  @IsOptional() @IsDateString() dateTo?: string;
}

export interface MarketingExpenseResponse {
  id: string;
  companyId: string;
  teamId: string | null;
  employeeId: string | null;
  earnCycleId: string;
  expenseDate: string;
  category: MarketingExpenseCategory;
  subCategory: string | null;
  amount: number;
  description: string | null;
  attachmentUrl: string | null;
  status: string;
  submittedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  rejectedReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MarketingExpenseSummaryResponse {
  totalExpense: number;
  costPerContact: number | null;
  costPerNewMember: number | null;
  costPerStartedWork: number | null;
  depositRoi: number | null;
  byCategory: Record<MarketingExpenseCategory, number>;
  kpi: {
    contactedCount: number;
    newMemberCount: number;
    depositAmount: number;
    startedWorkCount: number;
  };
}
