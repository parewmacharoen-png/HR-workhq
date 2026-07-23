// ============================================================================
// modules/marketing/application/dto/marketing-team.dto.ts
// ============================================================================

import { MarketingTeamLevel, MarketingTeamMemberRole } from '@prisma/client';
import { IsBoolean, IsDateString, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export class CreateMarketingTeamDto {
  @IsUUID()
  companyId!: string;

  @IsString()
  @MaxLength(40)
  code!: string;

  @IsString()
  @MaxLength(120)
  name!: string;

  @IsOptional()
  @IsUUID()
  parentTeamId?: string;

  @IsEnum(MarketingTeamLevel)
  level!: MarketingTeamLevel;
}

export class UpdateMarketingTeamDto {
  @IsOptional()
  @IsString()
  @MaxLength(40)
  code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AssignMarketingLeaderDto {
  @IsUUID()
  employeeId!: string;
}

export class AddMarketingTeamMemberDto {
  @IsUUID()
  employeeId!: string;

  @IsOptional()
  @IsEnum(MarketingTeamMemberRole)
  role?: MarketingTeamMemberRole;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;
}

export class TransferMarketingTeamMemberDto {
  @IsUUID()
  targetTeamId!: string;

  @IsOptional()
  @IsDateString()
  effectiveFrom?: string;

  @IsOptional()
  @IsEnum(MarketingTeamMemberRole)
  role?: MarketingTeamMemberRole;
}

export interface MarketingTeamResponse {
  id: string;
  companyId: string;
  code: string;
  name: string;
  parentTeamId: string | null;
  level: MarketingTeamLevel;
  bigLeaderEmployeeId: string | null;
  subLeaderEmployeeId: string | null;
  isActive: boolean;
}

export interface MarketingTeamMemberResponse {
  id: string;
  companyId: string;
  teamId: string;
  employeeId: string;
  role: MarketingTeamMemberRole;
  effectiveFrom: string;
  effectiveTo: string | null;
  isPrimary: boolean;
  teamCode?: string;
  teamName?: string;
}

export interface MarketingTeamTreeNodeResponse extends MarketingTeamResponse {
  children: MarketingTeamTreeNodeResponse[];
  memberCount: number;
}

export class ListMarketingTeamsQuery {
  @IsUUID()
  companyId!: string;
}
