// ============================================================================
// modules/disciplinary/application/dto/disciplinary.dto.ts
// POL-025 · DISC-001–005
// ============================================================================

import {
  IsEnum, IsNumber, IsOptional, IsString, IsUUID, MinLength,
} from 'class-validator';

export const DISCIPLINARY_ACTION_TYPES = [
  'verbal_warning',
  'warning_1',
  'warning_2',
  'termination',
] as const;

export type DisciplinaryActionType = (typeof DISCIPLINARY_ACTION_TYPES)[number];

export class CreateDisciplinaryActionDto {
  @IsUUID()
  companyId!: string;

  @IsEnum(DISCIPLINARY_ACTION_TYPES)
  actionType!: DisciplinaryActionType;

  @IsString()
  @MinLength(1)
  reason!: string;

  @IsOptional()
  @IsString()
  details?: string;

  @IsOptional()
  @IsString()
  evidenceUrl?: string;

  @IsOptional()
  @IsString()
  terminationReason?: string;

  @IsOptional()
  @IsString()
  terminationNote?: string;
}

export interface DisciplinaryActionResponse {
  id: string;
  employeeId: string;
  companyId: string;
  actionType: DisciplinaryActionType;
  reason: string;
  details: string | null;
  evidenceUrl: string | null;
  terminationReason: string | null;
  terminationNote: string | null;
  issuedBy: string;
  issuerName: string | null;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  createdAt: string;
  acknowledged: boolean;
}

export interface DisciplinarySummaryResponse {
  employeeId: string;
  verbalWarningCount: number;
  warning1Count: number;
  warning2Count: number;
  terminationCount: number;
  latestActionType: DisciplinaryActionType | null;
  latestActionAt: string | null;
  unacknowledgedCount: number;
  /** DISC-005 — warnings never expire; no expiry fields */
  warningsNeverExpire: true;
}

export interface DisciplinaryListResponse {
  summary: DisciplinarySummaryResponse;
  items: DisciplinaryActionResponse[];
}
