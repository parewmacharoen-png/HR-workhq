// ============================================================================
// modules/position-framework/application/dto/position-framework.dto.ts
// KPI-004
// ============================================================================

import {
  IsArray, IsEnum, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { FrameworkEntityStatus } from '../framework-entity.util';

export class CreatePositionFamilyDto {
  @IsUUID() companyId!: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdatePositionFamilyDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'archived'] as const)
  status?: FrameworkEntityStatus;
}

export class CreatePositionLevelDto {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() familyId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsInt() @Min(0) rankOrder?: number;
  @IsOptional() @IsString() description?: string;
}

export class UpdatePositionLevelDto {
  @IsOptional() @IsUUID() familyId?: string | null;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() @Min(0) rankOrder?: number;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'archived'] as const)
  status?: FrameworkEntityStatus;
}

export class CreatePositionDefinitionDto {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() familyId?: string;
  @IsOptional() @IsUUID() levelId?: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
}

export class UpdatePositionDefinitionDto {
  @IsOptional() @IsUUID() familyId?: string | null;
  @IsOptional() @IsUUID() levelId?: string | null;
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'archived'] as const)
  status?: FrameworkEntityStatus;
}

export class CareerPathStepInputDto {
  @IsUUID() positionDefinitionId!: string;
  @IsOptional() @IsInt() @Min(0) stepOrder?: number;
  @IsOptional() @IsString() notes?: string;
}

export class CreateCareerPathDto {
  @IsUUID() companyId!: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CareerPathStepInputDto)
  steps?: CareerPathStepInputDto[];
}

export class UpdateCareerPathDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'archived'] as const)
  status?: FrameworkEntityStatus;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => CareerPathStepInputDto)
  steps?: CareerPathStepInputDto[];
}

export class CreatePromotionPathDto {
  @IsUUID() companyId!: string;
  @IsString() code!: string;
  @IsString() name!: string;
  @IsOptional() @IsString() description?: string;
  @IsUUID() fromPositionId!: string;
  @IsUUID() toPositionId!: string;
  @IsOptional() @IsString() requirements?: string;
}

export class UpdatePromotionPathDto {
  @IsOptional() @IsString() code?: string;
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsUUID() fromPositionId?: string;
  @IsOptional() @IsUUID() toPositionId?: string;
  @IsOptional() @IsString() requirements?: string;
  @IsOptional() @IsEnum(['draft', 'active', 'archived'] as const)
  status?: FrameworkEntityStatus;
}

export interface FrameworkEntityResponse {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description: string | null;
  status: FrameworkEntityStatus;
  version: number;
  rootId: string | null;
  sourceId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PositionFamilyResponse extends FrameworkEntityResponse {}

export interface PositionLevelResponse extends FrameworkEntityResponse {
  familyId: string | null;
  rankOrder: number;
}

export interface PositionDefinitionResponse extends FrameworkEntityResponse {
  familyId: string | null;
  levelId: string | null;
}

export interface CareerPathStepResponse {
  id: string;
  positionDefinitionId: string;
  stepOrder: number;
  notes: string | null;
}

export interface CareerPathResponse extends FrameworkEntityResponse {
  steps: CareerPathStepResponse[];
}

export interface PromotionPathResponse extends FrameworkEntityResponse {
  fromPositionId: string;
  toPositionId: string;
  requirements: string | null;
}

export class UpdateEmployeePositionDto {
  @IsOptional() @IsUUID() positionFamilyId?: string | null;
  @IsOptional() @IsUUID() positionLevelId?: string | null;
  @IsOptional() @IsUUID() positionDefinitionId?: string | null;
}

export class BulkPositionUpdateDto {
  @IsUUID() companyId!: string;
  @IsArray() @IsUUID('4', { each: true }) employeeIds!: string[];
  @IsOptional() @IsUUID() positionFamilyId?: string | null;
  @IsOptional() @IsUUID() positionLevelId?: string | null;
  @IsOptional() @IsUUID() positionDefinitionId?: string | null;
}

export class PositionMigrationEntryDto {
  @IsString() legacyPosition!: string;
  @IsUUID() positionDefinitionId!: string;
}

export class MigratePositionsDto {
  @IsUUID() companyId!: string;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PositionMigrationEntryDto)
  mappings!: PositionMigrationEntryDto[];
}

export interface PositionSummary {
  id: string | null;
  code: string | null;
  name: string | null;
}

export interface MissingPositionAssignmentItem {
  employeeId: string;
  globalId: string;
  firstName: string;
  lastName: string;
  department: string | null;
  legacyPosition: string | null;
}

export interface MissingPositionAssignmentsDashboard {
  companyId: string;
  total: number;
  items: MissingPositionAssignmentItem[];
}

export interface EmployeeCareerPathResponse {
  employeeId: string;
  companyId: string;
  positionFamily: PositionSummary;
  positionLevel: PositionSummary;
  positionDefinition: PositionSummary;
  careerPath: CareerPathResponse | null;
  currentStep: CareerPathStepResponse | null;
  nextPositions: PositionDefinitionResponse[];
}

export interface PromotionPathValidationResult {
  valid: boolean;
  warning: string | null;
  currentPosition: PositionDefinitionResponse | null;
  careerPath: CareerPathResponse | null;
  nextPositions: PositionDefinitionResponse[];
  suggestedPaths: PromotionPathResponse[];
}
