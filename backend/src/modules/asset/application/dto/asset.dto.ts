// ============================================================================
// modules/asset/application/dto/asset.dto.ts
// ============================================================================

import {
  IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, MinLength,
} from 'class-validator';
import { AssetCategory, AssetDamageSeverity, AssetStatus } from '@prisma/client';

export class CreateAssetDto {
  @IsString()
  @MinLength(1)
  assetTag!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsEnum(AssetCategory)
  category!: AssetCategory;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number;
}

export class UpdateAssetDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  assetTag?: string;

  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsDateString()
  purchaseDate?: string | null;

  @IsOptional()
  @IsNumber()
  @Min(0)
  value?: number | null;
}

export class ListAssetsQuery {
  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @IsOptional()
  @IsEnum(AssetStatus)
  status?: AssetStatus;

  @IsOptional()
  @IsString()
  search?: string;
}

export class AssignAssetDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsString()
  conditionOut?: string;
}

export class ReturnAssetDto {
  @IsOptional()
  @IsString()
  conditionIn?: string;
}

export class ReportDamageDto {
  @IsEnum(AssetDamageSeverity)
  severity!: AssetDamageSeverity;

  @IsString()
  @MinLength(3)
  description!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  estimatedCost?: number;

  @IsOptional()
  @IsUUID()
  assignmentId?: string;
}

export class BorrowAssetDto {
  @IsUUID()
  employeeId!: string;

  @IsString()
  @MinLength(1)
  name!: string;

  @IsOptional()
  @IsEnum(AssetCategory)
  category?: AssetCategory;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsString()
  assetTag?: string;
}
