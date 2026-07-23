// ============================================================================
// modules/workflow/application/dto/workflow-inbox.dto.ts
// ============================================================================

import { IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, Min } from 'class-validator';
import { WorkflowEntityType } from '../../domain/entities/workflow.entity';

export class InboxQueryDto {
  @IsOptional() @IsUUID() companyId?: string;

  @IsOptional()
  @IsEnum([
    'leave', 'leave_reschedule', 'leave_shift_swap', 'overtime',
    'payroll_adjustment', 'commission_adjustment', 'advance',
  ] as const)
  entityType?: WorkflowEntityType;

  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}

export class HistoryQueryDto {
  @IsOptional() @IsUUID() companyId?: string;

  @IsOptional()
  @IsEnum(['pending', 'approved', 'rejected', 'returned', 'escalated', 'cancelled'] as const)
  status?: string;

  @IsOptional()
  entityType?: WorkflowEntityType;

  @IsOptional() @IsDateString() from?: string;
  @IsOptional() @IsDateString() to?: string;

  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
}

export class CreateDelegationDto {
  @IsUUID() delegateUserId!: string;

  @IsOptional() @IsUUID() companyId?: string;

  @IsOptional()
  @IsEnum([
    'leave', 'leave_reschedule', 'leave_shift_swap', 'overtime',
    'payroll_adjustment', 'commission_adjustment', 'advance',
  ] as const)
  entityType?: WorkflowEntityType;

  @IsDateString() validFrom!: string;
  @IsDateString() validTo!: string;

  @IsOptional() @IsString() reason?: string;
}
