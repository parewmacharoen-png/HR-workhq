// ============================================================================
// Manual payroll item DTOs
// ============================================================================

import {
  IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min,
} from 'class-validator';
import type {
  ManualPayrollItemCategory,
  ManualPayrollScheduleType,
} from '../../domain/manual-payroll-item.constants';

export class CreateManualPayrollItemDto {
  @IsUUID() companyId!: string;
  @IsUUID() employeeId!: string;

  @IsEnum([
    'bonus', 'commission', 'ot', 'meal_allowance', 'phone_allowance', 'fuel_allowance',
    'diligence_bonus', 'travel_allowance', 'other_earning',
    'utility_deduction', 'deposit_deduction', 'advance_deduction', 'penalty',
    'tax_deduction', 'other_deduction',
  ] as const)
  category!: ManualPayrollItemCategory;

  @IsNumber() @Min(0.01) amount!: number;

  @IsEnum(['one_time', 'recurring'] as const)
  scheduleType!: ManualPayrollScheduleType;

  @IsDateString() effectiveFrom!: string;
  @IsOptional() @IsDateString() effectiveUntil?: string;
  @IsOptional() @IsString() note?: string;

  /** When set, apply immediately to this open payroll cycle (one-time or first recurring run). */
  @IsOptional() @IsUUID() applyToCycleId?: string;
}

export interface ManualPayrollItemDefinitionResponse {
  id: string;
  companyId: string;
  employeeId: string;
  category: ManualPayrollItemCategory;
  categoryLabelTh: string;
  direction: 'earning' | 'deduction';
  amount: number;
  scheduleType: ManualPayrollScheduleType;
  effectiveFrom: string;
  effectiveUntil: string | null;
  note: string | null;
  status: string;
}

export interface ApplyManualPayrollItemsResult {
  cycleId: string;
  itemsCreated: number;
  itemsSkipped: number;
  definitionIds: string[];
}
