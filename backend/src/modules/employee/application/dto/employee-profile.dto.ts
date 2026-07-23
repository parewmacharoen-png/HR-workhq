// ============================================================================
// EMP-015 — Profile DTOs
// ============================================================================

import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Length, Min,
} from 'class-validator';
import { BUSINESS_ROLE_CODES } from '../../../permission/domain/entities/business-role.types';

export class UpdateEmployeeProfileDto {
  @IsOptional() @IsString() @Length(1, 200) fullName?: string;
  @IsOptional() @IsString() @Length(0, 60) nickname?: string;
  @IsOptional() @IsString() @Length(0, 32) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 80) lineId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsString() @Length(0, 160) emergencyContactName?: string;
  @IsOptional() @IsString() @Length(0, 80) emergencyContactRelationship?: string;
  @IsOptional() @IsString() @Length(0, 32) emergencyContactPhone?: string;
  @IsOptional() @IsUUID() profilePhotoDocumentId?: string;
  @IsOptional() @IsString() reason?: string;
}

export class UpdateEmployeePayrollInfoDto {
  @IsOptional() @IsString() bankName?: string;
  @IsOptional() @IsString() bankAccountNumber?: string;
  @IsOptional() @IsString() bankAccountHolder?: string;
  @IsOptional() @IsString() paymentMethod?: string;
  @IsOptional() @IsBoolean() mealAllowanceEligible?: boolean;
  @IsOptional() @IsBoolean() adminCommissionEligible?: boolean;
  @IsOptional() @IsBoolean() referralEligible?: boolean;
  @IsString() @Length(1, 512) reason!: string;
}

export class SalaryDirectEditDto {
  @IsNumber() @Min(1) salaryAmount!: number;
  @IsDateString() effectiveDate!: string;
  @IsString() @Length(1, 512) reason!: string;
  @IsString() @Length(1, 32) confirmation!: string;
}

export class UpdateEmployeeAccessDto {
  @IsOptional() @IsEnum(BUSINESS_ROLE_CODES) businessRole?: string;
  @IsOptional() companyScopes?: Array<{ companyId: string }>;
  @IsOptional() teamScopes?: Array<{ companyId: string; teamId: string }>;
  @IsOptional() permissionOverrides?: Array<{ permission: string; effect: 'allow' | 'deny' }>;
  @IsString() @Length(1, 512) reason!: string;
}

export class ArchiveEmployeeDto {
  @IsString() @Length(1, 512) reason!: string;
}

export class RestoreEmployeeDto {
  @IsString() @Length(1, 512) reason!: string;
}

export class HardDeleteEmployeeDto {
  @IsString() @Length(1, 512) reason!: string;
  @IsString() confirmation!: string;
}

export class CreateProfileChangeRequestDto {
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() nickname?: string;
  @IsOptional() @IsString() lineId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() emergencyContactName?: string;
  @IsOptional() @IsString() emergencyContactPhone?: string;
}
