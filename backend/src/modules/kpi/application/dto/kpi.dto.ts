// ============================================================================
// modules/kpi/application/dto/kpi.dto.ts
// KPI-001 / KPI-002
// ============================================================================

import {
  IsArray, IsDateString, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export type KpiTemplateStatus = 'draft' | 'active' | 'archived';
export type KpiCycleStatus = 'draft' | 'active' | 'scoring' | 'finalized' | 'cancelled';
export type KpiAssignmentStatus = 'pending' | 'in_progress' | 'submitted' | 'reviewed' | 'finalized';
export type KpiTargetType = 'number' | 'percent' | 'boolean' | 'rating' | 'text';
export type KpiScoringMethod = 'manual' | 'formula' | 'system' | 'api' | 'imported';

export class KpiMetricInputDto {
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsNumber() @Min(0) weight!: number;
  @IsEnum(['number', 'percent', 'boolean', 'rating', 'text'] as const)
  targetType!: KpiTargetType;
  @IsOptional() @IsString() targetValue?: string;
  @IsOptional() @IsEnum(['manual', 'formula', 'system', 'api', 'imported'] as const)
  scoringMethod?: KpiScoringMethod;
  @IsOptional() @IsString() formulaExpression?: string;
  @IsOptional() @IsString() systemSourceKey?: string;
  @IsOptional() @IsString() apiEndpoint?: string;
  @IsOptional() @IsString() apiFieldPath?: string;
  @IsOptional() @IsNumber() sortOrder?: number;
}

export class CreateKpiTemplateDto {
  @IsUUID() companyId!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() positionDefinitionId?: string;
  @IsOptional() @IsString() applicableRole?: string;
  @IsOptional() @IsString() applicableDepartment?: string;
  @IsOptional() @IsUUID() applicableTeamId?: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => KpiMetricInputDto)
  metrics!: KpiMetricInputDto[];
}

export class UpdateKpiTemplateDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() positionDefinitionId?: string;
  @IsOptional() @IsString() applicableRole?: string;
  @IsOptional() @IsString() applicableDepartment?: string;
  @IsOptional() @IsUUID() applicableTeamId?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'archived'] as const)
  status?: KpiTemplateStatus;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => KpiMetricInputDto)
  metrics?: KpiMetricInputDto[];
}

export class CreateKpiCycleDto {
  @IsUUID() companyId!: string;
  @IsString() name!: string;
  @IsDateString() periodStart!: string;
  @IsDateString() periodEnd!: string;
}

export class AssignKpiCycleDto {
  @IsUUID() templateId!: string;
  @IsArray() @IsUUID('4', { each: true }) employeeIds!: string[];
  @IsOptional() @IsUUID() reviewerId?: string;
}

export class KpiScoreItemInputDto {
  @IsUUID() metricId!: string;
  @IsOptional() @IsString() rawValue?: string;
  @IsOptional() @IsNumber() @Min(0) score?: number;
}

export class UpdateKpiScoresDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => KpiScoreItemInputDto)
  items!: KpiScoreItemInputDto[];
  @IsOptional() @IsString() employeeComment?: string;
  @IsOptional() @IsString() reviewerComment?: string;
}

export interface KpiMetricResponse {
  id: string;
  name: string;
  description: string | null;
  weight: number;
  targetType: KpiTargetType;
  targetValue: string | null;
  scoringMethod: KpiScoringMethod;
  formulaExpression: string | null;
  systemSourceKey: string | null;
  apiEndpoint: string | null;
  apiFieldPath: string | null;
  sortOrder: number;
}

export interface KpiTemplateResponse {
  id: string;
  companyId: string | null;
  positionDefinitionId: string | null;
  name: string;
  description: string | null;
  applicableRole: string | null;
  applicableDepartment: string | null;
  applicableTeamId: string | null;
  status: KpiTemplateStatus;
  version: number;
  rootId: string | null;
  sourceId: string | null;
  metrics: KpiMetricResponse[];
  createdAt: string;
  updatedAt: string;
}

export interface KpiCycleResponse {
  id: string;
  companyId: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  status: KpiCycleStatus;
  assignmentCount: number;
  createdAt: string;
}

export interface KpiScoreItemResponse {
  id: string;
  metricId: string;
  metricName: string;
  rawValue: string | null;
  score: number | null;
  weight: number;
}

export interface KpiScoreResponse {
  id: string;
  totalScore: number | null;
  grade: string | null;
  employeeComment: string | null;
  reviewerComment: string | null;
  finalizedAt: string | null;
  items: KpiScoreItemResponse[];
}

export interface KpiAssignmentResponse {
  id: string;
  cycleId: string;
  cycleName: string;
  employeeId: string;
  employeeCode: string;
  employeeName: string;
  templateId: string;
  templateName: string;
  reviewerId: string | null;
  status: KpiAssignmentStatus;
  score: KpiScoreResponse | null;
  createdAt: string;
}

export interface KpiDashboardResponse {
  companyId: string;
  activeCycles: KpiCycleResponse[];
  pendingAssignments: KpiAssignmentResponse[];
  submittedAssignments: KpiAssignmentResponse[];
  recentlyFinalized: KpiAssignmentResponse[];
}

export interface EmployeeKpiResponse {
  employeeId: string;
  companyId: string;
  assignments: KpiAssignmentResponse[];
}

export class CreateKpiPositionRuleDto {
  @IsOptional() @IsUUID() companyId?: string | null;
  @IsUUID() positionDefinitionId!: string;
  @IsUUID() kpiTemplateId!: string;
  @IsOptional() @IsNumber() @Min(0) priority?: number;
  @IsOptional() active?: boolean;
}

export class UpdateKpiPositionRuleDto {
  @IsOptional() @IsUUID() companyId?: string | null;
  @IsOptional() @IsUUID() positionDefinitionId?: string;
  @IsOptional() @IsUUID() kpiTemplateId?: string;
  @IsOptional() @IsNumber() @Min(0) priority?: number;
  @IsOptional() active?: boolean;
}

export interface KpiPositionRuleResponse {
  id: string;
  companyId: string | null;
  positionDefinitionId: string;
  positionDefinitionName: string;
  kpiTemplateId: string;
  kpiTemplateName: string;
  priority: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface KpiPositionRulesDashboard {
  companyId: string;
  activeRuleCount: number;
  totalRuleCount: number;
  employeesWithPosition: number;
  employeesWithoutMatchingRule: number;
  rules: KpiPositionRuleResponse[];
}
