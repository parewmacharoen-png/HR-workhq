// ============================================================================
// modules/payroll/application/dto/manual-commission.dto.ts
// ============================================================================

import {
  IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export const MANUAL_COMMISSION_TYPES = [
  'marketing_manual',
  'sales_manual',
  'other_manual',
] as const;

export type ManualCommissionType = typeof MANUAL_COMMISSION_TYPES[number];

export class CreateManualCommissionDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
  @IsUUID() payrollCycleId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsEnum(MANUAL_COMMISSION_TYPES) commissionType!: ManualCommissionType;
  @IsOptional() @IsString() description?: string;
  @IsString() reason!: string;
  @IsOptional() @IsUrl() sourceDocumentUrl?: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BulkManualCommissionRowDto {
  @IsUUID() employeeId!: string;
  @IsNumber() @Min(0.01) amount!: number;
  @IsEnum(MANUAL_COMMISSION_TYPES) commissionType!: ManualCommissionType;
  @IsOptional() @IsString() description?: string;
  @IsString() reason!: string;
  @IsOptional() @IsString() idempotencyKey?: string;
}

export class BulkManualCommissionDto {
  @IsUUID() payrollCycleId!: string;
  @IsUUID() companyId!: string;
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BulkManualCommissionRowDto)
  rows!: BulkManualCommissionRowDto[];
}

export interface ManualCommissionResponse {
  id: string;
  payrollItemId: string;
  employeeId: string;
  companyId: string;
  payrollCycleId: string;
  amount: number;
  commissionType: ManualCommissionType;
  description: string | null;
  reason: string;
  sourceDocumentUrl: string | null;
  createdAt: string;
}

export interface BulkManualCommissionRowResult {
  rowIndex: number;
  success: boolean;
  entry?: ManualCommissionResponse;
  error?: string;
}

export interface BulkManualCommissionResponse {
  payrollCycleId: string;
  companyId: string;
  results: BulkManualCommissionRowResult[];
  successCount: number;
  failureCount: number;
}
