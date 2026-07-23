// ============================================================================
// modules/marketing/infrastructure/persistence/marketing-team.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import {
  AddMarketingTeamMemberInput,
  CreateMarketingTeamInput,
  EmployeeMarketingTeamAtDate,
  MarketingTeamMemberRow,
  MarketingTeamRepository,
  MarketingTeamRow,
  UpdateMarketingTeamInput,
} from '../../domain/repositories/marketing-team.repository';
import {
  ActiveMarketingTeamMembershipExistsError,
  MarketingTeamNotFoundError,
} from '../../domain/errors/marketing-team.errors';

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function activeMembershipWhere(asOf: Date) {
  const day = startOfDay(asOf);
  return {
    deletedAt: null,
    isPrimary: true,
    effectiveFrom: { lte: day },
    OR: [{ effectiveTo: null }, { effectiveTo: { gte: day } }],
  };
}

@Injectable()
export class PrismaMarketingTeamRepository implements MarketingTeamRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<MarketingTeamRow | null> {
    const row = await this.prisma.marketingTeam.findFirst({
      where: { id, deletedAt: null },
    });
    return row ? this.mapTeam(row) : null;
  }

  async findByCode(companyId: string, code: string): Promise<MarketingTeamRow | null> {
    const row = await this.prisma.marketingTeam.findFirst({
      where: { companyId, code, deletedAt: null },
    });
    return row ? this.mapTeam(row) : null;
  }

  async listByCompany(companyId: string): Promise<MarketingTeamRow[]> {
    const rows = await this.prisma.marketingTeam.findMany({
      where: { companyId, deletedAt: null },
      orderBy: [{ level: 'asc' }, { code: 'asc' }],
    });
    return rows.map((row) => this.mapTeam(row));
  }

  async createTeam(input: CreateMarketingTeamInput): Promise<MarketingTeamRow> {
    const row = await this.prisma.marketingTeam.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        code: input.code,
        name: input.name,
        parentTeamId: input.parentTeamId ?? undefined,
        level: input.level,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return this.mapTeam(row);
  }

  async updateTeam(id: string, input: UpdateMarketingTeamInput): Promise<MarketingTeamRow> {
    const row = await this.prisma.marketingTeam.update({
      where: { id },
      data: {
        code: input.code,
        name: input.name,
        isActive: input.isActive,
        updatedBy: input.actorUserId,
      },
    });
    return this.mapTeam(row);
  }

  async deactivateTeam(id: string, actorUserId: string): Promise<MarketingTeamRow> {
    const row = await this.prisma.marketingTeam.update({
      where: { id },
      data: { isActive: false, updatedBy: actorUserId },
    });
    return this.mapTeam(row);
  }

  async assignBigLeader(
    teamId: string,
    employeeId: string,
    actorUserId: string,
  ): Promise<MarketingTeamRow> {
    const row = await this.prisma.marketingTeam.update({
      where: { id: teamId },
      data: { bigLeaderEmployeeId: employeeId, updatedBy: actorUserId },
    });
    return this.mapTeam(row);
  }

  async assignSubLeader(
    teamId: string,
    employeeId: string,
    actorUserId: string,
  ): Promise<MarketingTeamRow> {
    const row = await this.prisma.marketingTeam.update({
      where: { id: teamId },
      data: { subLeaderEmployeeId: employeeId, updatedBy: actorUserId },
    });
    return this.mapTeam(row);
  }

  async addMember(input: AddMarketingTeamMemberInput): Promise<MarketingTeamMemberRow> {
    const effectiveFrom = input.effectiveFrom ?? startOfDay(new Date());
    const row = await this.prisma.marketingTeamMember.create({
      data: {
        id: randomUUID(),
        companyId: input.companyId,
        teamId: input.teamId,
        employeeId: input.employeeId,
        role: input.role ?? 'member',
        effectiveFrom,
        isPrimary: true,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
    });
    return this.mapMember(row);
  }

  async closeMembership(
    membershipId: string,
    effectiveTo: Date,
    actorUserId: string,
  ): Promise<void> {
    await this.prisma.marketingTeamMember.update({
      where: { id: membershipId },
      data: {
        effectiveTo: startOfDay(effectiveTo),
        updatedBy: actorUserId,
      },
    });
  }

  async findActivePrimaryMembership(
    companyId: string,
    employeeId: string,
    asOf: Date = new Date(),
  ): Promise<MarketingTeamMemberRow | null> {
    const row = await this.prisma.marketingTeamMember.findFirst({
      where: {
        companyId,
        employeeId,
        ...activeMembershipWhere(asOf),
      },
    });
    return row ? this.mapMember(row) : null;
  }

  async listActiveTeamMembers(
    teamId: string,
    companyId: string,
    asOf: Date = new Date(),
  ): Promise<MarketingTeamMemberRow[]> {
    const rows = await this.prisma.marketingTeamMember.findMany({
      where: {
        teamId,
        companyId,
        ...activeMembershipWhere(asOf),
      },
    });
    return rows.map((row) => this.mapMember(row));
  }

  async listTeamEmployeeIds(
    teamId: string,
    companyId: string,
    asOf: Date = new Date(),
  ): Promise<string[]> {
    const members = await this.listActiveTeamMembers(teamId, companyId, asOf);
    return members.map((m) => m.employeeId);
  }

  async listTeamEmployeeIdsInPeriod(
    teamId: string,
    companyId: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<string[]> {
    const rows = await this.prisma.marketingTeamMember.findMany({
      where: {
        teamId,
        companyId,
        deletedAt: null,
        isPrimary: true,
        effectiveFrom: { lte: periodEnd },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: periodStart } }],
      },
      select: { employeeId: true },
    });
    return [...new Set(rows.map((row) => row.employeeId))];
  }

  async getEmployeeMarketingTeamAtDate(
    companyId: string,
    employeeId: string,
    asOf: Date,
  ): Promise<EmployeeMarketingTeamAtDate | null> {
    const membership = await this.prisma.marketingTeamMember.findFirst({
      where: {
        companyId,
        employeeId,
        ...activeMembershipWhere(asOf),
      },
      include: {
        team: {
          select: {
            id: true,
            code: true,
            name: true,
            level: true,
          },
        },
      },
    });
    if (!membership) return null;
    return {
      teamId: membership.team.id,
      teamCode: membership.team.code,
      teamName: membership.team.name,
      role: membership.role,
      level: membership.team.level,
    };
  }

  async resolveRootBigLeaderEmployeeId(
    teamId: string,
    companyId: string,
  ): Promise<string | null> {
    let current = await this.findById(teamId);
    if (!current || current.companyId !== companyId) return null;

    while (current.parentTeamId) {
      const parent = await this.findById(current.parentTeamId);
      if (!parent) break;
      current = parent;
    }

    return current.bigLeaderEmployeeId;
  }

  async listMembershipHistory(
    companyId: string,
    employeeId: string,
  ): Promise<Array<MarketingTeamMemberRow & { teamCode: string; teamName: string }>> {
    const rows = await this.prisma.marketingTeamMember.findMany({
      where: { companyId, employeeId, deletedAt: null },
      include: { team: { select: { code: true, name: true } } },
      orderBy: [{ effectiveFrom: 'desc' }, { createdAt: 'desc' }],
    });
    return rows.map((row) => ({
      ...this.mapMember(row),
      teamCode: row.team.code,
      teamName: row.team.name,
    }));
  }

  async getTeamOrThrow(id: string): Promise<MarketingTeamRow> {
    const team = await this.findById(id);
    if (!team) throw new MarketingTeamNotFoundError(id);
    return team;
  }

  private mapTeam(row: {
    id: string;
    companyId: string;
    code: string;
    name: string;
    parentTeamId: string | null;
    level: MarketingTeamRow['level'];
    bigLeaderEmployeeId: string | null;
    subLeaderEmployeeId: string | null;
    isActive: boolean;
  }): MarketingTeamRow {
    return {
      id: row.id,
      companyId: row.companyId,
      code: row.code,
      name: row.name,
      parentTeamId: row.parentTeamId,
      level: row.level,
      bigLeaderEmployeeId: row.bigLeaderEmployeeId,
      subLeaderEmployeeId: row.subLeaderEmployeeId,
      isActive: row.isActive,
    };
  }

  private mapMember(row: {
    id: string;
    companyId: string;
    teamId: string;
    employeeId: string;
    role: MarketingTeamMemberRow['role'];
    effectiveFrom: Date;
    effectiveTo: Date | null;
    isPrimary: boolean;
  }): MarketingTeamMemberRow {
    return {
      id: row.id,
      companyId: row.companyId,
      teamId: row.teamId,
      employeeId: row.employeeId,
      role: row.role,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
      isPrimary: row.isPrimary,
    };
  }
}
