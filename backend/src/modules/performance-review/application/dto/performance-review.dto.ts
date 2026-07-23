// ============================================================================
// modules/performance-review/application/dto/performance-review.dto.ts
// KPI-003
// ============================================================================

import {
  IsArray, IsBoolean, IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type PerformanceConfigStatus = 'draft' | 'active' | 'archived';
export type PerformanceReviewStatus =
  | 'draft'
  | 'in_progress'
  | 'submitted'
  | 'reviewed'
  | 'finalized'
  | 'cancelled';

export class CreatePerformanceWeightProfileDto {
  @IsUUID() companyId!: string;
  @IsString() name!: string;
  @IsNumber() @Min(0) kpiWeight!: number;
  @IsNumber() @Min(0) leaderReviewWeight!: number;
  @IsNumber() @Min(0) selfReviewWeight!: number;
  @IsNumber() @Min(0) feedback360Weight!: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
}

export class UpdatePerformanceWeightProfileDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsNumber() @Min(0) kpiWeight?: number;
  @IsOptional() @IsNumber() @Min(0) leaderReviewWeight?: number;
  @IsOptional() @IsNumber() @Min(0) selfReviewWeight?: number;
  @IsOptional() @IsNumber() @Min(0) feedback360Weight?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsString() status?: PerformanceConfigStatus;
}

export class CreatePerformanceReviewCycleDto {
  @IsUUID() companyId!: string;
  @IsString() name!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
  @IsUUID() weightProfileId!: string;
}

export class AssignPerformanceReviewCycleDto {
  @IsArray() @IsUUID('4', { each: true }) employeeIds!: string[];
  @IsOptional() @IsUUID() reviewerId?: string;
}

export class UpdatePerformanceReviewScoresDto {
  @IsOptional() @IsNumber() @Min(0) kpiScore?: number;
  @IsOptional() @IsNumber() @Min(0) leaderReviewScore?: number;
  @IsOptional() @IsNumber() @Min(0) selfReviewScore?: number;
  @IsOptional() @IsNumber() @Min(0) feedback360Score?: number;
  @IsOptional() @IsString() leaderComment?: string;
  @IsOptional() @IsString() selfComment?: string;
}

export class AddPerformance360FeedbackDto {
  @IsUUID() reviewerId!: string;
  @IsNumber() @Min(0) score!: number;
  @IsOptional() @IsString() comment?: string;
}

export interface PerformanceWeightProfileResponse {
  id: string;
  companyId: string;
  name: string;
  kpiWeight: number;
  leaderReviewWeight: number;
  selfReviewWeight: number;
  feedback360Weight: number;
  isDefault: boolean;
  status: PerformanceConfigStatus;
  version: number;
  rootId: string | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceReviewCycleResponse {
  id: string;
  companyId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  weightProfileId: string;
  weightProfileName: string;
  status: string;
  reviewCount: number;
  createdAt: string;
}

export interface PerformanceReview360FeedbackResponse {
  id: string;
  reviewerId: string;
  score: number;
  comment: string | null;
  createdAt: string;
}

export interface PerformanceReviewResponse {
  id: string;
  cycleId: string;
  cycleName: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  kpiAssignmentId: string | null;
  reviewerId: string | null;
  status: PerformanceReviewStatus;
  kpiScore: number | null;
  leaderReviewScore: number | null;
  selfReviewScore: number | null;
  feedback360Score: number | null;
  finalScore: number | null;
  grade: string | null;
  leaderComment: string | null;
  selfComment: string | null;
  finalizedAt: string | null;
  feedback360: PerformanceReview360FeedbackResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceDashboardResponse {
  companyId: string;
  activeCycles: PerformanceReviewCycleResponse[];
  pendingReviews: PerformanceReviewResponse[];
  submittedReviews: PerformanceReviewResponse[];
  recentlyFinalized: PerformanceReviewResponse[];
}

export interface EmployeePerformanceReviewsResponse {
  employeeId: string;
  companyId: string;
  reviews: PerformanceReviewResponse[];
}
