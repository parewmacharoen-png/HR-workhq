import { IsNumber, IsOptional, IsString, IsUUID, Min, MinLength } from 'class-validator';

export class UpdateAdminOvertimeDto {
  @IsUUID()
  companyId!: string;

  /** HH:mm or H.mm */
  @IsOptional()
  @IsString()
  startTime?: string;

  /** HH:mm or H.mm */
  @IsOptional()
  @IsString()
  endTime?: string;

  @IsOptional()
  @IsNumber()
  @Min(0.5)
  otHours?: number;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsString()
  @MinLength(3)
  correctionReason!: string;
}

export class DeleteAdminOvertimeDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @MinLength(3)
  reason!: string;
}
