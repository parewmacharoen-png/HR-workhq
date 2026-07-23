// ============================================================================
// modules/organization/infrastructure/persistence/organization.prisma.repository.ts
// Adapters implementing the domain ports against Prisma. All reads exclude
// soft-deleted rows by default. Maps Prisma records <-> domain entities.
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { Company } from '../../domain/entities/company.entity';
import { Team } from '../../domain/entities/team.entity';
import {
  CompanyRepository, TeamRepository, FunctionRepository, FunctionView,
} from '../../domain/repositories/organization.repository';

@Injectable()
export class PrismaCompanyRepository implements CompanyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Company | null> {
    const row = await this.prisma.company.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findByCode(code: string): Promise<Company | null> {
    const row = await this.prisma.company.findFirst({ where: { code, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async listActive(): Promise<Company[]> {
    const rows = await this.prisma.company.findMany({
      where: { deletedAt: null },
      orderBy: { code: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(company: Company, actorUserId: string): Promise<void> {
    const p = company.toPersistence();
    await this.prisma.company.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        code: p.code,
        name: p.name,
        legalName: p.legalName,
        timezone: p.timezone,
        isActive: p.isActive,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        code: p.code,
        name: p.name,
        legalName: p.legalName,
        timezone: p.timezone,
        isActive: p.isActive,
        updatedBy: actorUserId,
      },
    });
  }

  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.company.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId, isActive: false },
    });
  }

  private toDomain(row: {
    id: string; code: string; name: string; legalName: string | null;
    timezone: string; isActive: boolean; deletedAt: Date | null;
  }): Company {
    return Company.rehydrate({
      id: row.id,
      code: row.code,
      name: row.name,
      legalName: row.legalName,
      timezone: row.timezone,
      isActive: row.isActive,
      deletedAt: row.deletedAt,
    });
  }
}

@Injectable()
export class PrismaTeamRepository implements TeamRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<Team | null> {
    const row = await this.prisma.team.findFirst({ where: { id, deletedAt: null } });
    return row ? this.toDomain(row) : null;
  }

  async findByCompanyAndName(companyId: string, name: string): Promise<Team | null> {
    const row = await this.prisma.team.findFirst({
      where: { companyId, name, deletedAt: null },
    });
    return row ? this.toDomain(row) : null;
  }

  async listByCompany(companyId: string): Promise<Team[]> {
    const rows = await this.prisma.team.findMany({
      where: { companyId, deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => this.toDomain(r));
  }

  async save(team: Team, actorUserId: string): Promise<void> {
    const p = team.toPersistence();
    await this.prisma.team.upsert({
      where: { id: p.id },
      create: {
        id: p.id,
        companyId: p.companyId,
        functionId: p.functionId,
        name: p.name,
        parentTeamId: p.parentTeamId,
        bigLeaderEmployeeId: p.bigLeaderEmployeeId,
        isActive: p.isActive,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        functionId: p.functionId,
        name: p.name,
        parentTeamId: p.parentTeamId,
        bigLeaderEmployeeId: p.bigLeaderEmployeeId,
        isActive: p.isActive,
        updatedBy: actorUserId,
      },
    });
  }

  async softDelete(id: string, actorUserId: string): Promise<void> {
    await this.prisma.team.update({
      where: { id },
      data: { deletedAt: new Date(), deletedBy: actorUserId, isActive: false },
    });
  }

  private toDomain(row: {
    id: string; companyId: string; functionId: string | null; name: string;
    parentTeamId: string | null; bigLeaderEmployeeId: string | null;
    isActive: boolean; deletedAt: Date | null;
  }): Team {
    return Team.rehydrate({
      id: row.id,
      companyId: row.companyId,
      functionId: row.functionId,
      name: row.name,
      parentTeamId: row.parentTeamId,
      bigLeaderEmployeeId: row.bigLeaderEmployeeId,
      isActive: row.isActive,
      deletedAt: row.deletedAt,
    });
  }
}

@Injectable()
export class PrismaFunctionRepository implements FunctionRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findById(id: string): Promise<FunctionView | null> {
    const row = await this.prisma.function.findFirst({ where: { id, deletedAt: null } });
    return row ? { id: row.id, code: row.code, name: row.name } : null;
  }

  async listAll(): Promise<FunctionView[]> {
    const rows = await this.prisma.function.findMany({
      where: { deletedAt: null },
      orderBy: { name: 'asc' },
    });
    return rows.map((r) => ({ id: r.id, code: r.code, name: r.name }));
  }
}
