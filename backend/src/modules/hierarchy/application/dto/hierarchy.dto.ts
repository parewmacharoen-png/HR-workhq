// ============================================================================
// modules/hierarchy/application/dto/hierarchy.dto.ts
// ============================================================================

import {
  IsDateString, IsIn, IsOptional, IsUUID, ValidateIf,
} from 'class-validator';
import { HIERARCHY_RELATIONSHIP_TYPES } from '../../domain/types/hierarchy.types';

export class UpdateReportingLineDto {
  @ValidateIf((o) => o.managerEmployeeId !== null)
  @IsUUID()
  managerEmployeeId!: string | null;

  @IsOptional()
  @IsIn(HIERARCHY_RELATIONSHIP_TYPES)
  relationshipType?: typeof HIERARCHY_RELATIONSHIP_TYPES[number];

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}
