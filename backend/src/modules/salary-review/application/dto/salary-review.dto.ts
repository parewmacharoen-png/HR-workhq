// ============================================================================
// modules/salary-review/application/dto/salary-review.dto.ts
// SAL-001
// ============================================================================

import { IsDateString, IsNumber, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export interface LatestKpiScoreSummary {
  assignmentId: string;
  cycleName: string;
  templateName: string;
  totalScore: number | null;
  grade: string | null;
  finalizedAt: string;
}

export type CompensationReviewStatus =
  | 'draft'
  | 'pending_approval'
  | 'approved'
  | 'rejected'
  | 'applied';

export class CreateSalaryReviewDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
  @IsNumber() @Min(0) proposedSalary!: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
  @IsDateString() effectiveDate!: string;
}

export class UpdateSalaryReviewDto {
  @IsOptional() @IsNumber() @Min(0) proposedSalary?: number;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export class RejectCompensationReviewDto {
  @IsOptional() @IsString() reason?: string;
}

export class CreatePromotionReviewDto {
  @IsUUID() employeeId!: string;
  @IsUUID() companyId!: string;
  @IsString() proposedPosition!: string;
  @IsOptional() @IsUUID() proposedPositionDefinitionId?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
  @IsDateString() effectiveDate!: string;
}

export class UpdatePromotionReviewDto {
  @IsOptional() @IsString() proposedPosition?: string;
  @IsOptional() @IsString() reason?: string;
  @IsOptional() @IsString() note?: string;
  @IsOptional() @IsDateString() effectiveDate?: string;
}

export interface SalaryReviewResponse {
  id: string;
  employeeId: string;
  companyId: string;
  employeeCode: string;
  employeeName: string;
  currentSalary: number;
  proposedSalary: number;
  increaseAmount: number;
  increasePercent: number;
  reason: string | null;
  effectiveDate: string;
  status: CompensationReviewStatus;
  requestedBy: string | null;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
}

export interface PromotionReviewResponse {
  id: string;
  employeeId: string;
  companyId: string;
  employeeCode: string;
  employeeName: string;
  currentPosition: string | null;
  proposedPosition: string;
  reason: string | null;
  effectiveDate: string;
  status: CompensationReviewStatus;
  requestedBy: string | null;
  approvedBy: string | null;
  rejectedBy: string | null;
  rejectedAt: string | null;
  appliedAt: string | null;
  createdAt: string;
  pathValidation?: {
    valid: boolean;
    warning: string | null;
    suggestedPathCount: number;
  } | null;
}

export interface CompensationDashboardResponse {
  companyId: string;
  pendingSalaryReviews: SalaryReviewResponse[];
  pendingPromotionReviews: PromotionReviewResponse[];
  upcomingSalaryChanges: SalaryReviewResponse[];
  upcomingPromotionChanges: PromotionReviewResponse[];
  promotionsOutsideCareerPath: number;
}

export interface CompensationTimelineResponse {
  employeeId: string;
  companyId: string | null;
  hireDate: string | null;
  currentSalary: number;
  currentPosition: string | null;
  salaryHistory: Array<{
    id: string;
    monthlySalary: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    reason: string | null;
  }>;
  salaryReviews: SalaryReviewResponse[];
  promotionReviews: PromotionReviewResponse[];
  pendingSalaryReviews: SalaryReviewResponse[];
  pendingPromotionReviews: PromotionReviewResponse[];
  latestKpiScore: LatestKpiScoreSummary | null;
}

export type CompensationReviewListType = 'salary' | 'promotion';

export interface CompensationReviewListItem {
  id: string;
  type: CompensationReviewListType;
  employeeId: string;
  companyId: string;
  employeeCode: string;
  employeeName: string;
  currentValue: string;
  proposedValue: string;
  increaseAmount: number | null;
  increasePercent: number | null;
  effectiveDate: string;
  status: CompensationReviewStatus;
  requestedBy: string | null;
  requestedByName: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  reason: string | null;
  createdAt: string;
}

export interface CompensationReviewListResponse {
  companyId: string;
  items: CompensationReviewListItem[];
  total: number;
}
