// ============================================================================
// modules/performance/application/dto/performance.dto.ts
// ============================================================================

import {
  ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsInt,
  IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// ── Cycle ──────────────────────────────────────────────────────────────────
export class OpenCycleDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}

// ── Evaluation ─────────────────────────────────────────────────────────────
export class CreateEvaluationDto {
  @IsUUID() cycleId!: string;
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
}

export class ScoreEntryDto {
  @IsEnum(['attendance', 'recruitment', 'discipline', 'manager_review', 'owner_review'] as const)
  dimension!: 'attendance' | 'recruitment' | 'discipline' | 'manager_review' | 'owner_review';

  @IsNumber() @Min(0) @Max(100) rawScore!: number;
}

export class SubmitScoresDto {
  @IsEnum(['system', 'manager', 'owner', 'ai'] as const)
  scoredBy!: 'system' | 'manager' | 'owner' | 'ai';

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => ScoreEntryDto)
  scores!: ScoreEntryDto[];
}

export class FinalizeEvaluationDto {
  @IsOptional() @IsString() promotionNotes?: string;
}

// ── Weight configuration ────────────────────────────────────────────────────
export class WeightEntryDto {
  @IsEnum(['attendance', 'recruitment', 'discipline', 'manager_review', 'owner_review'] as const)
  dimension!: 'attendance' | 'recruitment' | 'discipline' | 'manager_review' | 'owner_review';

  @IsNumber() @Min(0) @Max(1) weight!: number;
}

export class SetWeightsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => WeightEntryDto)
  weights!: WeightEntryDto[];

  @IsDateString() effectiveFrom!: string;
}

// ── Probation ───────────────────────────────────────────────────────────────
export class CreateProbationReviewDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
  @IsDateString() probationStartDate!: string;
  @IsDateString() probationEndDate!: string;
  @IsOptional() @IsUUID() evaluationId?: string;
  @IsOptional() @IsString() notes?: string;
}

export class ResolveProbationDto {
  @IsEnum(['passed', 'extended', 'failed', 'PASS', 'EXTEND', 'FAIL'] as const)
  outcome!: 'passed' | 'extended' | 'failed' | 'PASS' | 'EXTEND' | 'FAIL';

  @IsOptional() @IsDateString() extendedUntil?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) extensionDays?: number;
  @IsOptional() @IsString() notes?: string;
}

// ── Responses ───────────────────────────────────────────────────────────────
export interface CycleResponse {
  id: string; companyId: string | null;
  periodStart: string; periodEnd: string; status: string;
}

export interface EvaluationResponse {
  id: string; employeeId: string; cycleId: string; companyId: string;
  totalScore: number; grade: string | null;
  promotionReadiness: string | null; salaryReviewRecommendation: string | null;
  salaryIncreasePct: number | null; status: string;
  workflowInstanceId: string | null;
}

export interface EvaluationScoreResponse {
  dimension: string; rawScore: number; weightApplied: number;
  weightedScore: number; scoredBy: string;
}

export interface ProbationReviewResponse {
  id: string; employeeId: string; companyId: string;
  probationStartDate: string; probationEndDate: string;
  outcome: string; extendedUntil: string | null;
  notes: string | null;
  reviewedBy: string | null;
  reviewerName: string | null;
  reviewedAt: string | null;
  createdAt: string;
}

export interface ProbationEndingSoonItem {
  employeeId: string;
  employeeName: string;
  department: string | null;
  position: string | null;
  probationEndDate: string;
  daysRemaining: number;
  pendingReviewId: string | null;
}

export interface ProbationDashboardResponse {
  pendingReviews: ProbationDashboardReviewItem[];
  endingSoon: ProbationEndingSoonItem[];
}

export interface ProbationDashboardReviewItem extends ProbationReviewResponse {
  employeeName: string;
  daysRemaining: number;
}

export interface WeightHistoryResponse {
  dimension: string; weight: number;
  effectiveFrom: string; effectiveTo: string | null;
}
