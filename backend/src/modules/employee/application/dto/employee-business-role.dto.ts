// ============================================================================
// PATCH /employees/:id/business-role
// ============================================================================

import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { BUSINESS_ROLE_CODES, BusinessRoleCode } from '../../../permission/domain/entities/business-role.types';

export class UpdateEmployeeBusinessRoleDto {
  @IsIn([...BUSINESS_ROLE_CODES])
  businessRole!: BusinessRoleCode;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}
