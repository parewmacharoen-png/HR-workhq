// ============================================================================
// modules/commission/application/dto/admin-commission.dto.ts
// ============================================================================

import { IsNumber, IsOptional, IsUUID } from 'class-validator';

export class CalculateAdminCommissionDto {
  @IsUUID() companyId!: string;
  @IsUUID() earnCycleId!: string;
  @IsNumber() netProfit!: number;
  /** Optional per-employee extra leave day overrides */
  @IsOptional() extraLeaveOverrides?: Record<string, number>;
}

export interface AdminCommissionCycleResponse {
  cycleId: string;
  netProfit: number;
  adminPool: number;
  poolA: number;
  poolB: number;
  totalPenalties: number;
  totalRedistributed: number;
  totalPayable: number;
  frontOfficeTotal: number;
  backOfficeTotal: number;
  memberCount: number;
  status: string;
  members: Array<{
    employeeId: string;
    employeeName?: string;
    globalId?: string;
    finalPayout: number;
    status: string;
    officeType: string;
    penaltyDeduction: number;
    redistributionBonus: number;
  }>;
}

export interface AdminCommissionSummaryResponse {
  companyId: string;
  earnCycleId: string | null;
  totalAdminPool: number;
  poolATotal: number;
  poolBTotal: number;
  totalPenalties: number;
  totalRedistributed: number;
  totalPayable: number;
  frontOfficeTotal: number;
  backOfficeTotal: number;
}
