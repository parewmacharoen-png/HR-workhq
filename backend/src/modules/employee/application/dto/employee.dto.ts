// ============================================================================
// modules/employee/application/dto/employee.dto.ts
// ============================================================================

import {
  IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsOptional, IsString, IsUUID, Length, IsArray, Min, ValidateIf,
} from 'class-validator';
import { BUSINESS_ROLE_CODES, BusinessRoleCode } from '../../../permission/domain/entities/business-role.types';

export class CreateEmployeeDto {
  @IsString() @Length(1, 100) firstName!: string;
  @IsString() @Length(1, 100) lastName!: string;
  @IsDateString() hireDate!: string;

  @IsOptional() @IsString() @Length(1, 60) nickname?: string;
  @IsOptional() @IsString() @Length(1, 64) nationalId?: string;
  @IsOptional() @IsString() @Length(1, 32) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsDateString() probationEndDate?: string;
}

export class RehireEmployeeDto {
  @IsUUID() previousEmployeeId!: string;
  @IsDateString() hireDate!: string;
  @IsOptional() @IsDateString() probationEndDate?: string;
}

export class UpdateContactDto {
  @IsOptional() @IsString() @Length(0, 32) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 60) nickname?: string;
  @IsOptional() @IsEnum(['office', 'wfh'] as const) workCategory?: 'office' | 'wfh';
}

export class CreateAssignmentDto {
  @IsUUID() companyId!: string;
  @IsDateString() effectiveFrom!: string;

  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsUUID() functionId?: string;
  @IsOptional() @IsEnum(['employee', 'sub_leader', 'big_leader'] as const)
  roleLevel?: 'employee' | 'sub_leader' | 'big_leader';
  @IsOptional() @IsBoolean() isPrimaryCompany?: boolean;
  @IsOptional() @IsBoolean() isPrimaryTeam?: boolean;
}

export interface EmployeeResponse {
  id: string;
  globalId: string;
  firstName: string;
  lastName: string;
  employmentStatus: string;
  rehireOfEmployeeId: string | null;
  nickname?: string | null;
  phone?: string | null;
  email?: string | null;
  department?: string | null;
  position?: string | null;
  employmentType?: string | null;
  workCategory?: 'office' | 'wfh';
  hireDate?: string;
  dateOfBirth?: string | null;
  ageYears?: number | null;
  tenureYears?: number;
  tenureMonths?: number;
  tenureDays?: number;
  tenureDisplay?: string;
  tenureDisplayDetailed?: string;
  tenureText?: string;
  anniversaryYears?: number;
  probationStatus?: string;
  probationStatusCode?: string;
  probationEndDate?: string | null;
  nextAnniversaryMilestoneYears?: number | null;
  nextAnniversaryMilestoneLabel?: string | null;
}

export interface EmployeeListItem extends EmployeeResponse {
  positionFamilyId?: string | null;
  positionLevelId?: string | null;
  positionDefinitionId?: string | null;
  telegramLinked: boolean;
  primaryTeamId: string | null;
  teamName?: string | null;
  userId: string | null;
  username: string | null;
}

export interface EmployeeListResponse {
  items: EmployeeListItem[];
  total: number;
}

export class OnboardCompanyAssignmentDto {
  @IsUUID() companyId!: string;
  @IsOptional() @IsString() @Length(1, 120) department?: string;
  @IsOptional() @IsUUID() teamId?: string;
}

export class CreateEmployeeOnboardDto {
  @IsString() @Length(1, 100) firstName!: string;
  @IsString() @Length(1, 100) lastName!: string;
  @IsDateString() startDate!: string;

  @IsUUID() companyId!: string;

  @IsOptional() @IsString() @Length(1, 60) nickname?: string;
  @IsOptional() @IsString() @Length(1, 32) phone?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(1, 120) department?: string;
  @IsOptional() @IsUUID() teamId?: string;
  @IsOptional() @IsString() @Length(1, 120) position?: string;
  @IsOptional() @IsDateString() dateOfBirth?: string;
  @IsOptional() @IsEnum(['permanent', 'full_time', 'part_time', 'probation', 'contract'] as const)
  employmentType?: 'permanent' | 'full_time' | 'part_time' | 'probation' | 'contract';
  @IsOptional() @IsEnum(['office', 'wfh'] as const) workCategory?: 'office' | 'wfh';
  @IsOptional() @IsDateString() probationEndDate?: string;

  @IsOptional() @IsBoolean() createLogin?: boolean;
  @ValidateIf((dto) => dto.createLogin === true)
  @IsString() @Length(3, 120) username?: string;
  @ValidateIf((dto) => dto.createLogin === true)
  @IsString() @Length(8, 64) password?: string;
  @IsOptional() @IsIn([...BUSINESS_ROLE_CODES])
  businessRole?: BusinessRoleCode;
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) companyScopeIds?: string[];
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) teamScopeIds?: string[];
  /** Extra company assignments (non-primary). Primary is `companyId`. */
  @IsOptional() @IsArray() @IsUUID('4', { each: true }) additionalCompanyIds?: string[];
  @IsOptional() @IsArray() companyAssignments?: OnboardCompanyAssignmentDto[];

  /** Monthly base salary — required so payroll can calculate like every other employee. */
  @IsInt() @Min(1) monthlySalary!: number;

  /** For shared payroll staff — company that collects monthly deposit (defaults to primary company). */
  @IsOptional() @IsUUID() depositCollectionCompanyId?: string;
}

export interface EmployeeOnboardResponse extends EmployeeResponse {
  userId: string | null;
  username: string | null;
  assignmentId: string;
}

export interface AssignmentResponse {
  id: string;
  employeeId: string;
  companyId: string;
  teamId: string | null;
  roleLevel: string;
  isPrimaryCompany: boolean;
  isPrimaryTeam: boolean;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface SalaryHistoryBandResponse {
  id: string;
  companyId: string;
  monthlySalary: number;
  effectiveFrom: string;
  effectiveTo: string | null;
}

export interface SalaryHistoryResponse {
  employeeId: string;
  bands: SalaryHistoryBandResponse[];
}
