// ============================================================================
// modules/exit/application/dto/exit-asset.dto.ts
// ============================================================================

import {
  IsEnum, IsNumber, IsOptional, IsString, Min,
} from 'class-validator';
import { LOSS_CLAIM_CATEGORIES, LossClaimCategory } from './loss-claim.dto';

export const EXIT_ASSET_STATUSES = [
  'pending',
  'returned',
  'damaged',
  'lost',
  'waived',
] as const;

export type ExitAssetStatus = (typeof EXIT_ASSET_STATUSES)[number];

export class UpdateExitAssetReviewDto {
  @IsEnum(['returned', 'damaged', 'lost', 'waived'])
  status!: 'returned' | 'damaged' | 'lost' | 'waived';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateClaimFromAssetDto {
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
}

export interface ExitAssetReviewResponse {
  assignmentId: string;
  assetId: string;
  assetTag: string | null;
  assetName: string | null;
  category: string | null;
  status: string;
  notes: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
}
