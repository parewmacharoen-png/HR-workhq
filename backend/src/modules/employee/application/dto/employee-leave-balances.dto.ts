import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  Min,
  ValidateNested,
} from 'class-validator';

export class EmployeeLeaveBalanceItemDto {
  @IsIn(['emergency', 'sick', 'unpaid'])
  leaveTypeCode!: 'emergency' | 'sick' | 'unpaid';

  /** Days used outside the system before go-live (current year / period). */
  @IsNumber()
  @Min(0)
  priorUsed!: number;

  /** Emergency entitlement for the current half-year. */
  @IsOptional()
  @IsNumber()
  @Min(0)
  entitled?: number;
}

export class UpdateEmployeeLeaveBalancesDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => EmployeeLeaveBalanceItemDto)
  items!: EmployeeLeaveBalanceItemDto[];
}
