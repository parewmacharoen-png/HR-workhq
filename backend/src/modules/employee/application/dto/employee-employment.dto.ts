import { Type } from 'class-transformer';
import {
  IsArray, IsDateString, IsEnum, IsOptional, IsString, IsUUID, Length, ValidateNested,
} from 'class-validator';

const EMPLOYMENT_STATUSES = ['probation', 'active', 'suspended', 'terminated'] as const;
const WORK_LOCATIONS = ['office', 'wfh'] as const;
const SHIFT_TYPES = ['day', 'night'] as const;
const OFFICE_TYPES = ['front_office', 'back_office'] as const;

export class EmploymentCompanyAssignmentDto {
  @IsUUID() companyId!: string;
  @IsOptional() @IsUUID() teamId?: string | null;
  @IsOptional() @IsString() @Length(0, 120) department?: string;
}

export class UpdateEmployeeEmploymentDto {
  @IsOptional() @IsUUID() companyId?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => EmploymentCompanyAssignmentDto)
  companyAssignments?: EmploymentCompanyAssignmentDto[];
  @IsOptional() @IsString() @Length(0, 120) department?: string;
  @IsOptional() @IsString() @Length(0, 120) position?: string;
  @IsOptional() @IsString() @Length(0, 40) employmentType?: string;
  @IsOptional() @IsEnum(EMPLOYMENT_STATUSES) employmentStatus?: typeof EMPLOYMENT_STATUSES[number];
  @IsOptional() @IsDateString() joinDate?: string;
  @IsOptional() @IsDateString() probationEndDate?: string;
  @IsOptional() @IsDateString() resignDate?: string;
  @IsOptional() @IsUUID() supervisorId?: string;
  @IsOptional() @IsEnum(WORK_LOCATIONS) workLocation?: typeof WORK_LOCATIONS[number];
  @IsOptional() @IsEnum(SHIFT_TYPES) shift?: typeof SHIFT_TYPES[number];
  @IsOptional() @IsEnum(OFFICE_TYPES) officeType?: typeof OFFICE_TYPES[number];
  @IsOptional() @IsString() @Length(0, 512) reason?: string;
}
