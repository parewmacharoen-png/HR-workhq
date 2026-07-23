// ============================================================================
// modules/marketing/domain/repositories/marketing-team.repository.ts
// ============================================================================

import { MarketingTeamLevel, MarketingTeamMemberRole } from '@prisma/client';

export const MARKETING_TEAM_REPOSITORY = Symbol('MARKETING_TEAM_REPOSITORY');

export interface MarketingTeamRow {
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

export interface MarketingTeamMemberRow {
  id: string;
  companyId: string;
  teamId: string;
  employeeId: string;
  role: MarketingTeamMemberRole;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  isPrimary: boolean;
}

export interface EmployeeMarketingTeamAtDate {
  teamId: string;
  teamCode: string;
  teamName: string;
  role: MarketingTeamMemberRole;
  level: MarketingTeamLevel;
}

export interface CreateMarketingTeamInput {
  companyId: string;
  code: string;
  name: string;
  parentTeamId?: string | null;
  level: MarketingTeamLevel;
  actorUserId: string;
}

export interface UpdateMarketingTeamInput {
  code?: string;
  name?: string;
  isActive?: boolean;
  actorUserId: string;
}

export interface AddMarketingTeamMemberInput {
  companyId: string;
  teamId: string;
  employeeId: string;
  role?: MarketingTeamMemberRole;
  effectiveFrom?: Date;
  actorUserId: string;
}

export interface MarketingTeamTreeNode extends MarketingTeamRow {
  children: MarketingTeamTreeNode[];
  memberCount: number;
}

export interface MarketingTeamRepository {
  findById(id: string): Promise<MarketingTeamRow | null>;
  findByCode(companyId: string, code: string): Promise<MarketingTeamRow | null>;
  listByCompany(companyId: string): Promise<MarketingTeamRow[]>;
  createTeam(input: CreateMarketingTeamInput): Promise<MarketingTeamRow>;
  updateTeam(id: string, input: UpdateMarketingTeamInput): Promise<MarketingTeamRow>;
  deactivateTeam(id: string, actorUserId: string): Promise<MarketingTeamRow>;
  assignBigLeader(teamId: string, employeeId: string, actorUserId: string): Promise<MarketingTeamRow>;
  assignSubLeader(teamId: string, employeeId: string, actorUserId: string): Promise<MarketingTeamRow>;
  addMember(input: AddMarketingTeamMemberInput): Promise<MarketingTeamMemberRow>;
  closeMembership(membershipId: string, effectiveTo: Date, actorUserId: string): Promise<void>;
  findActivePrimaryMembership(
    companyId: string,
    employeeId: string,
    asOf?: Date,
  ): Promise<MarketingTeamMemberRow | null>;
  listActiveTeamMembers(
    teamId: string,
    companyId: string,
    asOf?: Date,
  ): Promise<MarketingTeamMemberRow[]>;
  listTeamEmployeeIds(teamId: string, companyId: string, asOf?: Date): Promise<string[]>;
  listTeamEmployeeIdsInPeriod(
    teamId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<string[]>;
  getEmployeeMarketingTeamAtDate(
    companyId: string,
    employeeId: string,
    asOf: Date,
  ): Promise<EmployeeMarketingTeamAtDate | null>;
  resolveRootBigLeaderEmployeeId(teamId: string, companyId: string): Promise<string | null>;
  listMembershipHistory(
    companyId: string,
    employeeId: string,
  ): Promise<Array<MarketingTeamMemberRow & { teamCode: string; teamName: string }>>;
}
