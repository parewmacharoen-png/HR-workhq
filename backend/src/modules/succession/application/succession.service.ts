import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { SuccessionPlanStatus, SuccessionReadiness } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';

/** HR-021 — Succession Planning */
@Injectable()
export class SuccessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  async listCriticalRoles(actor: ActorContext, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.criticalRole.findMany({
      where: { companyId, status: 'active' },
      include: {
        currentHolder: { select: { id: true, firstName: true, lastName: true } },
        candidates: {
          include: { employee: { select: { id: true, firstName: true, lastName: true } } },
        },
        position: { select: { id: true, name: true } },
      },
      orderBy: { name: 'asc' },
    });
  }

  async createCriticalRole(actor: ActorContext, dto: {
    companyId: string;
    name: string;
    description?: string;
    riskLevel?: string;
    positionDefinitionId?: string;
    currentHolderEmployeeId?: string;
  }) {
    this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const id = randomUUID();
    const row = await this.prisma.criticalRole.create({
      data: {
        id,
        companyId: dto.companyId,
        name: dto.name,
        description: dto.description,
        riskLevel: dto.riskLevel ?? 'medium',
        positionDefinitionId: dto.positionDefinitionId,
        currentHolderEmployeeId: dto.currentHolderEmployeeId,
      },
    });
    await this.audit.record(actor, { entityType: 'CriticalRole', entityId: id, action: 'create' });
    return row;
  }

  async updateCriticalRole(actor: ActorContext, id: string, dto: Partial<{
    name: string;
    description: string;
    riskLevel: string;
    currentHolderEmployeeId: string;
    status: string;
  }>) {
    const existing = await this.prisma.criticalRole.findUnique({ where: { id } });
    if (!existing) throw new Error('Critical role not found');
    this.companyAccess.assertCompanyAccess(actor, existing.companyId);
    const row = await this.prisma.criticalRole.update({ where: { id }, data: dto });
    await this.audit.record(actor, { entityType: 'CriticalRole', entityId: id, action: 'edit' });
    return row;
  }

  async addCandidate(actor: ActorContext, criticalRoleId: string, dto: {
    employeeId: string;
    readiness?: SuccessionReadiness;
    strengthsJson?: Record<string, unknown>;
    gapsJson?: Record<string, unknown>;
    developmentPlan?: string;
  }) {
    const role = await this.prisma.criticalRole.findUnique({ where: { id: criticalRoleId } });
    if (!role) throw new Error('Critical role not found');
    this.companyAccess.assertCompanyAccess(actor, role.companyId);
    await this.employeeAccess.assertEmployeeReadable(actor, dto.employeeId);

    const row = await this.prisma.successionCandidate.upsert({
      where: { criticalRoleId_employeeId: { criticalRoleId, employeeId: dto.employeeId } },
      create: {
        criticalRoleId,
        employeeId: dto.employeeId,
        readiness: dto.readiness ?? 'not_ready',
        strengthsJson: (dto.strengthsJson ?? undefined) as object | undefined,
        gapsJson: (dto.gapsJson ?? undefined) as object | undefined,
        developmentPlan: dto.developmentPlan,
        nominatedBy: actor.userId,
      },
      update: {
        readiness: dto.readiness ?? 'not_ready',
        strengthsJson: (dto.strengthsJson ?? undefined) as object | undefined,
        gapsJson: (dto.gapsJson ?? undefined) as object | undefined,
        developmentPlan: dto.developmentPlan,
        nominatedBy: actor.userId,
      },
      include: { employee: { select: { id: true, firstName: true, lastName: true } } },
    });
    await this.audit.record(actor, { entityType: 'SuccessionCandidate', entityId: row.id, action: 'upsert' });
    return row;
  }

  async updateReadiness(actor: ActorContext, candidateId: string, readiness: SuccessionReadiness) {
    const existing = await this.prisma.successionCandidate.findUnique({
      where: { id: candidateId },
      include: { criticalRole: true },
    });
    if (!existing) throw new Error('Candidate not found');
    this.companyAccess.assertCompanyAccess(actor, existing.criticalRole.companyId);
    const row = await this.prisma.successionCandidate.update({
      where: { id: candidateId },
      data: { readiness },
    });
    await this.audit.record(actor, { entityType: 'SuccessionCandidate', entityId: candidateId, action: 'readiness_update', after: { readiness } });
    return row;
  }

  async listPlans(actor: ActorContext, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.successionPlan.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPlan(actor: ActorContext, dto: {
    companyId: string;
    name: string;
    periodStart: string;
    periodEnd: string;
  }) {
    this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const row = await this.prisma.successionPlan.create({
      data: {
        companyId: dto.companyId,
        name: dto.name,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        status: 'draft',
        createdBy: actor.userId,
      },
    });
    await this.audit.record(actor, { entityType: 'SuccessionPlan', entityId: row.id, action: 'create' });
    return row;
  }

  async rolesWithoutBackup(actor: ActorContext, companyId: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    const roles = await this.prisma.criticalRole.findMany({
      where: { companyId, status: 'active' },
      include: { candidates: true },
    });
    return roles.filter((r) => !r.candidates.some((c) => c.readiness === 'ready_now' || c.readiness === 'ready_3_months'));
  }
}
