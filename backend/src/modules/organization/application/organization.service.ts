// ============================================================================
// modules/organization/application/organization.service.ts
// Application layer: orchestrates use cases, enforces cross-aggregate rules,
// writes audit logs. Thin — business invariants live in the entities.
// ============================================================================

import { Inject, Injectable, Optional, forwardRef } from '@nestjs/common';
import { randomUUID as cryptoRandomUUID } from 'crypto';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  COMPANY_REPOSITORY, TEAM_REPOSITORY,
  CompanyRepository, TeamRepository,
} from '../domain/repositories/organization.repository';
import { Company } from '../domain/entities/company.entity';
import { Team } from '../domain/entities/team.entity';
import {
  CompanyNotFoundError, DuplicateCompanyCodeError,
  DuplicateTeamNameError, TeamCompanyMismatchError, TeamNotFoundError,
} from '../domain/errors/organization.errors';
import {
  CreateCompanyDto, UpdateCompanyDto, CreateTeamDto,
  CompanyResponse, TeamResponse,
} from './dto/organization.dto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import {
  ensureMarketingTeamsForCompany,
  isMarketingDepartment,
} from './marketing-teams.bootstrap';
import { SharedPayrollService } from '../../payroll/application/shared-payroll.service';

@Injectable()
export class OrganizationService {
  constructor(
    @Inject(COMPANY_REPOSITORY) private readonly companies: CompanyRepository,
    @Inject(TEAM_REPOSITORY) private readonly teams: TeamRepository,
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    @Optional() @Inject(forwardRef(() => SharedPayrollService))
    private readonly sharedPayroll?: SharedPayrollService,
  ) {}

  // ---- Company use cases -------------------------------------------------

  async createCompany(actor: ActorContext, dto: CreateCompanyDto): Promise<CompanyResponse> {
    const existing = await this.companies.findByCode(dto.code.toUpperCase());
    if (existing) throw new DuplicateCompanyCodeError(dto.code);

    const company = Company.create({ id: cryptoRandomUUID(), ...dto });
    await this.companies.save(company, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Company',
      entityId: company.id,
      action: 'create',
      after: company.toPersistence(),
    });
    if (company.isActive) {
      await this.sharedPayroll?.reconcileAllSharedEmployees(actor).catch(() => undefined);
    }
    return this.toCompanyResponse(company);
  }

  async updateCompany(actor: ActorContext, id: string, dto: UpdateCompanyDto): Promise<CompanyResponse> {
    const company = await this.companies.findById(id);
    if (!company) throw new CompanyNotFoundError(id);

    const before = company.toPersistence();
    const wasInactive = !before.isActive;
    if (dto.name !== undefined) company.rename(dto.name);
    if (dto.isActive === true) company.activate();
    if (dto.isActive === false) company.deactivate();

    await this.companies.save(company, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Company',
      entityId: company.id,
      action: 'update',
      before,
      after: company.toPersistence(),
    });
    if (dto.isActive === true && wasInactive) {
      await this.sharedPayroll?.reconcileAllSharedEmployees(actor).catch(() => undefined);
    }
    return this.toCompanyResponse(company);
  }

  async deleteCompany(actor: ActorContext, id: string): Promise<void> {
    const company = await this.companies.findById(id);
    if (!company) throw new CompanyNotFoundError(id);
    await this.companies.softDelete(id, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Company',
      entityId: id,
      action: 'delete',
      before: company.toPersistence(),
    });
  }

  async getCompany(id: string): Promise<CompanyResponse> {
    const company = await this.companies.findById(id);
    if (!company) throw new CompanyNotFoundError(id);
    return this.toCompanyResponse(company);
  }

  async listCompanies(): Promise<CompanyResponse[]> {
    const list = await this.companies.listActive();
    return list.map((c) => this.toCompanyResponse(c));
  }

  // ---- Team use cases ----------------------------------------------------

  async createTeam(actor: ActorContext, dto: CreateTeamDto): Promise<TeamResponse> {
    const company = await this.companies.findById(dto.companyId);
    if (!company) throw new CompanyNotFoundError(dto.companyId);

    const dup = await this.teams.findByCompanyAndName(dto.companyId, dto.name.trim());
    if (dup) throw new DuplicateTeamNameError(dto.name);

    if (dto.parentTeamId) {
      const parent = await this.teams.findById(dto.parentTeamId);
      if (!parent) throw new TeamNotFoundError(dto.parentTeamId);
      if (parent.companyId !== dto.companyId) throw new TeamCompanyMismatchError();
    }

    const team = Team.create({ id: cryptoRandomUUID(), ...dto });
    await this.teams.save(team, actor.userId);
    await this.audit.record(actor, {
      entityType: 'Team',
      entityId: team.id,
      action: 'create',
      after: team.toPersistence(),
    });
    return this.toTeamResponse(team);
  }

  async listTeams(companyId: string, department?: string): Promise<TeamResponse[]> {
    if (isMarketingDepartment(department)) {
      await ensureMarketingTeamsForCompany(this.prisma, companyId);
    }
    let list = await this.teams.listByCompany(companyId);
    if (department && isMarketingDepartment(department)) {
      list = list.filter((t) => /^Team \d+$/i.test(t.name.trim()));
    }
    return list.map((t) => this.toTeamResponse(t));
  }

  // ---- mappers -----------------------------------------------------------

  private toCompanyResponse(c: Company): CompanyResponse {
    const p = c.toPersistence();
    return { id: p.id, code: p.code, name: p.name, isActive: p.isActive };
  }

  private toTeamResponse(t: Team): TeamResponse {
    const p = t.toPersistence();
    return { id: p.id, companyId: p.companyId, name: p.name, parentTeamId: p.parentTeamId };
  }
}
