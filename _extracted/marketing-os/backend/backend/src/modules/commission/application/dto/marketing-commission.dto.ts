// ============================================================================
// modules/commission/application/dto/marketing-commission.dto.ts
// ============================================================================

import {
  IsNumber, IsObject, IsOptional, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class MarketingFinancialDto {
  @IsNumber() grossProfit!: number;
  @IsNumber() employeeSalaryExpense!: number;
  @IsOptional() @IsNumber() marketingExpense?: number;
  @IsOptional() @IsNumber() lineExpense?: number;
  @IsOptional() @IsNumber() telesalesExpense?: number;
  @IsOptional() @IsNumber() @Min(0) promotionExpense?: number;
}

export class CalculateMarketingCommissionDto {
  @IsUUID() companyId!: string;
  @IsUUID() teamId!: string;
  @IsUUID() earnCycleId!: string;
  @ValidateNested() @Type(() => MarketingFinancialDto) financial!: MarketingFinancialDto;
  /** employeeId → ramp override percent (e.g. 50 = 50%) */
  @IsOptional() @IsObject() rampOverrides?: Record<string, number>;
}

export interface MarketingCommissionCycleResponse {
  cycleId: string;
  netProfit: number;
  teamCommissionPool: number;
  bigLeaderCommission: number;
  memberCount: number;
  status: string;
  members: Array<{
    employeeId: string;
    finalPayout: number;
    status: string;
    kpiQualified: boolean;
    rampPercent: number;
  }>;
}

export interface MarketingCommissionSummaryResponse {
  companyId: string;
  earnCycleId: string | null;
  totalTeamPool: number;
  paidAmount: number;
  holdAmount: number;
  carryForwardAmount: number;
  redistributedAmount: number;
  bigLeaderCommission: number;
}
