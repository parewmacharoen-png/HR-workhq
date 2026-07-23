// ============================================================================
// modules/reporting/application/dto/reporting.dto.ts
// ============================================================================

import { IsDateString, IsEnum, IsOptional, IsUUID, IsInt, Min, Max } from 'class-validator';

export type SnapshotTypeParam =
  | 'morning_brief' | 'evening_brief' | 'executive' | 'profit'
  | 'forecast'      | 'risk'          | 'owner'     | 'company'
  | 'pending_approval';

export class GetSnapshotQuery {
  @IsOptional() @IsDateString() date?: string;
}

export class GetSnapshotHistoryQuery {
  @IsOptional() @IsInt() @Min(1) @Max(90) limit?: number;
}

export class GetTrendQuery {
  @IsDateString() from!: string;
  @IsDateString() to!: string;
  @IsOptional() @IsUUID() companyId?: string;
}

export class GetSummaryQuery {
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() @IsUUID() companyId?: string;
}

export class GetCommissionDashboardQuery {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() earnCycleId?: string;
  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;
  @IsOptional() comparePreviousMonth?: boolean;
}

export class GenerateDashboardDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsDateString() date?: string;
}
