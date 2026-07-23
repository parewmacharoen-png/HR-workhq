// ============================================================================
// modules/workflow/application/dto/approval.dto.ts
// ============================================================================

import {
  IsArray, IsInt, IsOptional, IsString, IsUUID, Min, ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class WorkflowPreviewDto {
  @IsString()
  workflowType!: string;

  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsUUID()
  companyId?: string;

  @IsOptional()
  @IsString()
  leaveTypeCode?: string;
}

class MatrixStepDto {
  @IsInt() @Min(1)
  stepOrder!: number;

  @IsString()
  label!: string;

  @IsString()
  approverStrategy!: string;

  @IsOptional() @IsUUID()
  fixedUserId?: string;

  @IsOptional() @IsUUID()
  fixedRoleId?: string;
}

export class UpdateApprovalMatrixDto {
  @IsOptional() @IsString()
  name?: string;

  @IsOptional() @IsInt() @Min(1)
  minApprovalCount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MatrixStepDto)
  steps?: MatrixStepDto[];
}
