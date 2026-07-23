// ============================================================================
// modules/exit/application/dto/loss-claim.dto.ts
// ============================================================================

import {
  IsEnum, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';

export const LOSS_CLAIM_CATEGORIES = [
  'property_damage',
  'lost_equipment',
  'cash_shortage',
  'other_company_loss',
] as const;

export type LossClaimCategory = (typeof LOSS_CLAIM_CATEGORIES)[number];

export class CreateLossClaimDto {
  @IsEnum(LOSS_CLAIM_CATEGORIES)
  category!: LossClaimCategory;

  @IsNumber()
  @Min(0.01)
  amount!: number;

  @IsString()
  description!: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  assetId?: string;
}

export class UpdateLossClaimDto {
  @IsOptional()
  @IsEnum(LOSS_CLAIM_CATEGORIES)
  category?: LossClaimCategory;

  @IsOptional()
  @IsNumber()
  @Min(0.01)
  amount?: number;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;
}

export interface LossClaimResponse {
  id: string;
  exitCaseId: string;
  employeeId: string;
  companyId: string;
  amount: number;
  category: string;
  description: string;
  evidenceUrl: string | null;
  assetId: string | null;
  status: string;
  approvedByOwner: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdAt: string;
}
