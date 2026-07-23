// ============================================================================
// MarketingTeamService — marketing org structure source of truth
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { MarketingTeamMemberRole } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { AuditService } from '../../../shared/audit/audit.service';
import {
  MARKETING_TEAM_REPOSITORY,
  MarketingTeamMemberRow,
  MarketingTeamRepository,
  MarketingTeamRow,
  MarketingTeamTreeNode,
} from '../domain/repositories/marketing-team.repository';
import {
  ActiveMarketingTeamMembershipExistsError,
  DuplicateMarketingTeamCodeError,
  InvalidMarketingTeamStructureError,
  MarketingTeamAccessDeniedError,
  MarketingTeamMemberNotFoundError,
  MarketingTeamNotFoundError,
} from '../domain/errors/marketing-team.errors';
import {
  AddMarketingTeamMemberDto,
  CreateMarketingTeamDto,
  MarketingTeamMemberResponse,
  MarketingTeamResponse,
  MarketingTeamTreeNodeResponse,
  TransferMarketingTeamMemberDto,
  UpdateMarketingTeamDto,
} from './dto/marketing-team.dto';

function parseDate(value: string): Date {
  return new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
}

function startOfDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

@Injectable()
export class MarketingTeamService {
  constructor(
    @Inject(MARKETING_TEAM_REPOSITORY)
    private readonly teams: MarketingTeamRepository,
    private readonly prisma: PrismaService,
    private readonly companyAccess: CompanyAccessService,
    private readonly audit: AuditService,
  ) {}

  async createTeam(actor: ActorContext, dto: CreateMarketingTeamDto): Promise<MarketingTeamResponse> {
    await this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const existing = await this.teams.findByCode(dto.companyId, dto.code);
    if (existing) throw new DuplicateMarketingTeamCodeError(dto.code);

    if (dto.level === 'root' && dto.parentTeamId) {
      throw new InvalidMarketingTeamStructureError('Root marketing teams cannot have a parent');
    }
    if (dto.level === 'sub_team') {
      if (!dto.parentTeamId) {
        throw new InvalidMarketingTeamStructureError('Sub teams require a parent team');
      }
      const parent = await this.teams.findById(dto.parentTeamId);
      if (!parent || parent.companyId !== dto.companyId || parent.level !== 'root') {
        throw new InvalidMarketingTeamStructureError('Sub team parent must be a root marketing team');
      }
    }

    const row = await this.teams.createTeam({
      companyId: dto.companyId,
      code: dto.code,
      name: dto.name,
      parentTeamId: dto.parentTeamId ?? null,
      level: dto.level,
      actorUserId: actor.userId,
    });

    await this.audit.record(actor, {
      entityType: 'MarketingTeam',
      entityId: row.id,
      action: 'create',
      after: row,
    });
    return this.toTeamResponse(row);
  }

  async updateTeam(
    actor: ActorContext,
    id: string,
    dto: UpdateMarketingTeamDto,
  ): Promise<MarketingTeamResponse> {
    const existing = await this.getTeamOrThrow(actor, id);
    if (dto.code && dto.code !== existing.code) {
      const dup = await this.teams.findByCode(existing.companyId, dto.code);
      if (dup) throw new DuplicateMarketingTeamCodeError(dto.code);
    }

    const row = await this.teams.updateTeam(id, {
      code: dto.code,
      name: dto.name,
      isActive: dto.isActive,
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'MarketingTeam',
      entityId: id,
      action: 'update',
      before: existing,
      after: row,
    });
    return this.toTeamResponse(row);
  }

  async deactivateTeam(actor: ActorContext, id: string): Promise<MarketingTeamResponse> {
    const existing = await this.getTeamOrThrow(actor, id);
    const row = await this.teams.deactivateTeam(id, actor.userId);
    await this.audit.record(actor, {
      entityType: 'MarketingTeam',
      entityId: id,
      action: 'deactivate',
      before: existing,
      after: row,
    });
    return this.toTeamResponse(row);
  }

  async assignBigLeader(
    actor: ActorContext,
    teamId: string,
    employeeId: string,
  ): Promise<MarketingTeamResponse> {
    const team = await this.getTeamOrThrow(actor, teamId);
    if (team.level !== 'root') {
      throw new InvalidMarketingTeamStructureError('Big leader can only be assigned to root teams');
    }

    await this.ensureEmployeeInCompany(team.companyId, employeeId);
    const row = await this.teams.assignBigLeader(teamId, employeeId, actor.userId);

    const membership = await this.teams.findActivePrimaryMembership(team.companyId, employeeId);
    if (!membership || membership.teamId !== teamId) {
      await this.addMemberInternal(actor, team.companyId, teamId, employeeId, 'big_leader');
    } else if (membership.role !== 'big_leader') {
      await this.teams.closeMembership(membership.id, startOfDay(new Date()), actor.userId);
      await this.addMemberInternal(actor, team.companyId, teamId, employeeId, 'big_leader');
    }

    return this.toTeamResponse(row);
  }

  async assignSubLeader(
    actor: ActorContext,
    teamId: string,
    employeeId: string,
  ): Promise<MarketingTeamResponse> {
    const team = await this.getTeamOrThrow(actor, teamId);
    if (team.level !== 'sub_team') {
      throw new InvalidMarketingTeamStructureError('Sub leader can only be assigned to sub teams');
    }

    await this.ensureEmployeeInCompany(team.companyId, employeeId);
    const row = await this.teams.assignSubLeader(teamId, employeeId, actor.userId);

    const membership = await this.teams.findActivePrimaryMembership(team.companyId, employeeId);
    if (!membership || membership.teamId !== teamId) {
      await this.addMemberInternal(actor, team.companyId, teamId, employeeId, 'sub_leader');
    } else if (membership.role !== 'sub_leader') {
      await this.teams.closeMembership(membership.id, startOfDay(new Date()), actor.userId);
      await this.addMemberInternal(actor, team.companyId, teamId, employeeId, 'sub_leader');
    }

    return this.toTeamResponse(row);
  }

  async addMember(
    actor: ActorContext,
    teamId: string,
    dto: AddMarketingTeamMemberDto,
  ): Promise<MarketingTeamMemberResponse> {
    const team = await this.getTeamOrThrow(actor, teamId);
    await this.ensureEmployeeInCompany(team.companyId, dto.employeeId);

    const active = await this.teams.findActivePrimaryMembership(team.companyId, dto.employeeId);
    if (active) {
      throw new ActiveMarketingTeamMembershipExistsError(dto.employeeId);
    }

    const row = await this.addMemberInternal(
      actor,
      team.companyId,
      teamId,
      dto.employeeId,
      dto.role ?? 'member',
      dto.effectiveFrom ? parseDate(dto.effectiveFrom) : undefined,
    );
    return this.toMemberResponse(row);
  }

  async transferMember(
    actor: ActorContext,
    teamId: string,
    employeeId: string,
    dto: TransferMarketingTeamMemberDto,
  ): Promise<MarketingTeamMemberResponse> {
    const sourceTeam = await this.getTeamOrThrow(actor, teamId);
    const targetTeam = await this.teams.findById(dto.targetTeamId);
    if (!targetTeam || targetTeam.companyId !== sourceTeam.companyId || !targetTeam.isActive) {
      throw new MarketingTeamNotFoundError(dto.targetTeamId);
    }

    const effectiveFrom = dto.effectiveFrom ? parseDate(dto.effectiveFrom) : startOfDay(new Date());
    const current = await this.prisma.marketingTeamMember.findFirst({
      where: {
        companyId: sourceTeam.companyId,
        employeeId,
        teamId,
        deletedAt: null,
        isPrimary: true,
        effectiveTo: null,
      },
    });
    if (!current) {
      throw new MarketingTeamMemberNotFoundError(employeeId, teamId);
    }

    const closeDate = new Date(effectiveFrom.getTime() - 86400000);
    await this.teams.closeMembership(current.id, closeDate, actor.userId);

    const row = await this.addMemberInternal(
      actor,
      sourceTeam.companyId,
      dto.targetTeamId,
      employeeId,
      dto.role ?? current.role,
      effectiveFrom,
    );

    await this.audit.record(actor, {
      entityType: 'MarketingTeamMember',
      entityId: row.id,
      action: 'transfer',
      after: { fromTeamId: teamId, toTeamId: dto.targetTeamId, employeeId },
    });
    return this.toMemberResponse(row);
  }

  async removeMember(
    actor: ActorContext,
    teamId: string,
    employeeId: string,
  ): Promise<void> {
    const team = await this.getTeamOrThrow(actor, teamId);
    const current = await this.teams.findActivePrimaryMembership(team.companyId, employeeId);
    if (!current || current.teamId !== teamId) {
      throw new MarketingTeamMemberNotFoundError(employeeId, teamId);
    }

    await this.teams.closeMembership(current.id, startOfDay(new Date()), actor.userId);
    await this.audit.record(actor, {
      entityType: 'MarketingTeamMember',
      entityId: current.id,
      action: 'remove',
      before: current,
    });
  }

  async listTeams(actor: ActorContext, companyId: string): Promise<MarketingTeamResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.teams.listByCompany(companyId);
    return rows.map((row) => this.toTeamResponse(row));
  }

  async getTeamTree(actor: ActorContext, companyId: string): Promise<MarketingTeamTreeNodeResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.teams.listByCompany(companyId);
    const memberCounts = await Promise.all(rows.map(async (team) => ({
      teamId: team.id,
      count: (await this.teams.listActiveTeamMembers(team.id, companyId)).length,
    })));
    const countById = new Map(memberCounts.map((c) => [c.teamId, c.count]));

    const nodes = new Map<string, MarketingTeamTreeNode>();
    for (const row of rows) {
      nodes.set(row.id, {
        ...row,
        children: [],
        memberCount: countById.get(row.id) ?? 0,
      });
    }

    const roots: MarketingTeamTreeNode[] = [];
    for (const node of nodes.values()) {
      if (node.parentTeamId && nodes.has(node.parentTeamId)) {
        nodes.get(node.parentTeamId)!.children.push(node);
      } else {
        roots.push(node);
      }
    }

    return roots.map((node) => this.toTreeResponse(node));
  }

  async getTeam(actor: ActorContext, id: string): Promise<MarketingTeamResponse> {
    const row = await this.getTeamOrThrow(actor, id);
    return this.toTeamResponse(row);
  }

  async getActiveTeamMembers(
    actor: ActorContext,
    teamId: string,
    asOf?: string,
  ): Promise<MarketingTeamMemberResponse[]> {
    const team = await this.getTeamOrThrow(actor, teamId);
    const date = asOf ? parseDate(asOf) : new Date();
    const rows = await this.teams.listActiveTeamMembers(team.id, team.companyId, date);
    return rows.map((row) => this.toMemberResponse(row));
  }

  async getEmployeeMarketingTeamAtDate(
    companyId: string,
    employeeId: string,
    asOf: Date,
  ) {
    return this.teams.getEmployeeMarketingTeamAtDate(companyId, employeeId, asOf);
  }

  async getMembershipHistory(
    actor: ActorContext,
    companyId: string,
    employeeId: string,
  ): Promise<MarketingTeamMemberResponse[]> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const rows = await this.teams.listMembershipHistory(companyId, employeeId);
    return rows.map((row) => this.toMemberResponse(row));
  }

  async assertCanViewTeam(actor: ActorContext, companyId: string, teamId: string): Promise<void> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    if (await this.companyAccess.hasAllScope(actor.userId)) return;

    const employeeId = await this.employeeIdForUser(actor.userId);
    if (!employeeId) throw new MarketingTeamAccessDeniedError();

    const team = await this.teams.findById(teamId);
    if (!team || team.companyId !== companyId) throw new MarketingTeamNotFoundError(teamId);

    if (team.bigLeaderEmployeeId === employeeId) return;

    const rootBigLeader = await this.teams.resolveRootBigLeaderEmployeeId(teamId, companyId);
    if (rootBigLeader === employeeId) return;

    const subLeaderTeamIds = await this.prisma.marketingTeam.findMany({
      where: {
        companyId,
        subLeaderEmployeeId: employeeId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    if (subLeaderTeamIds.some((t) => t.id === teamId)) return;

    throw new MarketingTeamAccessDeniedError();
  }

  async leaderMarketingTeamId(employeeId: string): Promise<string | null> {
    const subLeaderTeam = await this.prisma.marketingTeam.findFirst({
      where: {
        subLeaderEmployeeId: employeeId,
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    if (subLeaderTeam) return subLeaderTeam.id;

    const bigLeaderRoot = await this.prisma.marketingTeam.findFirst({
      where: {
        bigLeaderEmployeeId: employeeId,
        level: 'root',
        deletedAt: null,
        isActive: true,
      },
      select: { id: true },
    });
    return bigLeaderRoot?.id ?? null;
  }

  async isMarketingLeader(employeeId: string): Promise<boolean> {
    return !!(await this.leaderMarketingTeamId(employeeId));
  }

  private async addMemberInternal(
    actor: ActorContext,
    companyId: string,
    teamId: string,
    employeeId: string,
    role: MarketingTeamMemberRole = 'member',
    effectiveFrom?: Date,
  ): Promise<MarketingTeamMemberRow> {
    const row = await this.teams.addMember({
      companyId,
      teamId,
      employeeId,
      role,
      effectiveFrom,
      actorUserId: actor.userId,
    });
    await this.audit.record(actor, {
      entityType: 'MarketingTeamMember',
      entityId: row.id,
      action: 'add',
      after: row,
    });
    return row;
  }

  private async getTeamOrThrow(actor: ActorContext, id: string): Promise<MarketingTeamRow> {
    const row = await this.teams.findById(id);
    if (!row) throw new MarketingTeamNotFoundError(id);
    await this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  private async ensureEmployeeInCompany(companyId: string, employeeId: string): Promise<void> {
    const assignment = await this.prisma.employeeAssignment.findFirst({
      where: {
        employeeId,
        companyId,
        deletedAt: null,
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: new Date() } }],
      },
      select: { id: true },
    });
    if (!assignment) {
      throw new InvalidMarketingTeamStructureError(`Employee ${employeeId} is not assigned to company`);
    }
  }

  private async employeeIdForUser(userId: string): Promise<string | null> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { employeeId: true },
    });
    return user?.employeeId ?? null;
  }

  private toTeamResponse(row: MarketingTeamRow): MarketingTeamResponse {
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

  private toMemberResponse(row: MarketingTeamMemberRow & { teamCode?: string; teamName?: string }):
  MarketingTeamMemberResponse {
    return {
      id: row.id,
      companyId: row.companyId,
      teamId: row.teamId,
      employeeId: row.employeeId,
      role: row.role,
      effectiveFrom: row.effectiveFrom.toISOString().slice(0, 10),
      effectiveTo: row.effectiveTo ? row.effectiveTo.toISOString().slice(0, 10) : null,
      isPrimary: row.isPrimary,
      teamCode: row.teamCode,
      teamName: row.teamName,
    };
  }

  private toTreeResponse(node: MarketingTeamTreeNode): MarketingTeamTreeNodeResponse {
    return {
      ...this.toTeamResponse(node),
      memberCount: node.memberCount,
      children: node.children.map((child) => this.toTreeResponse(child)),
    };
  }
}
