// ============================================================================
// modules/organization/application/dto/organization.dto.ts
// ============================================================================

import {
  IsBoolean, IsOptional, IsString, Length, Matches, IsUUID,
} from 'class-validator';

export class CreateCompanyDto {
  @IsString()
  @Length(1, 8)
  @Matches(/^[A-Za-z0-9]+$/, { message: 'code must be alphanumeric' })
  code!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsString()
  @Length(1, 200)
  legalName?: string;

  @IsOptional()
  @IsString()
  @Length(1, 40)
  timezone?: string;
}

export class UpdateCompanyDto {
  @IsOptional()
  @IsString()
  @Length(1, 120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class CreateTeamDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @Length(1, 120)
  name!: string;

  @IsOptional()
  @IsUUID()
  functionId?: string;

  @IsOptional()
  @IsUUID()
  parentTeamId?: string;

  @IsOptional()
  @IsUUID()
  bigLeaderEmployeeId?: string;
}

export interface CompanyResponse {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
}

export interface TeamResponse {
  id: string;
  companyId: string;
  name: string;
  parentTeamId: string | null;
}
