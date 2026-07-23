import { IsDateString, IsIn, IsNumber, IsOptional, IsString, Min, MinLength } from 'class-validator';

export class UpdateEmployeeLeaveHistoryDto {
  @IsIn(['leave_request', 'monthly_off'])
  source!: 'leave_request' | 'monthly_off';

  @IsOptional() @IsString() leaveTypeCode?: string;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
  @IsOptional() @IsNumber() @Min(0.5) days?: number;
  @IsOptional() @IsString() reason?: string;

  /** Current off date for monthly_off history rows (YYYY-MM-DD). */
  @IsOptional() @IsDateString() offDate?: string;

  @IsString() @MinLength(3) correctionReason!: string;
}

export class DeleteEmployeeLeaveHistoryDto {
  @IsIn(['leave_request', 'monthly_off'])
  source!: 'leave_request' | 'monthly_off';

  /** Current off date for monthly_off history rows (YYYY-MM-DD). */
  @IsOptional() @IsDateString() offDate?: string;
}
