import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { CompetencyStatus } from '@prisma/client';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { EmployeeAccessService } from '../../employee/application/employee-access.service';

/** HR-020 — Competency Matrix */
@Injectable()
export class CompetencyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly employeeAccess: EmployeeAccessService,
  ) {}

  list(actor: ActorContext, companyId?: string, status?: string) {
    if (companyId) this.companyAccess.assertCompanyAccess(actor, companyId);
    return this.prisma.competency.findMany({
      where: {
        ...(companyId !== undefined ? { OR: [{ companyId }, { companyId: null }] } : {}),
        ...(status ? { status: status as CompetencyStatus } : {}),
      },
      include: { levels: { orderBy: { level: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async get(actor: ActorContext, id: string) {
    const row = await this.prisma.competency.findUnique({
      where: { id },
      include: { levels: { orderBy: { level: 'asc' } } },
    });
    if (!row) throw new Error('Competency not found');
    if (row.companyId) this.companyAccess.assertCompanyAccess(actor, row.companyId);
    return row;
  }

  async create(actor: ActorContext, dto: {
    companyId?: string;
    name: string;
    description?: string;
    category?: string;
    levels?: Array<{ level: number; label: string; description?: string }>;
  }) {
    if (dto.companyId) this.companyAccess.assertCompanyAccess(actor, dto.companyId);
    const id = randomUUID();
    await this.prisma.$transaction(async (tx) => {
      await tx.competency.create({
        data: {
          id,
          companyId: dto.companyId ?? null,
          name: dto.name,
          description: dto.description,
          category: dto.category,
          createdBy: actor.userId,
        },
      });
      if (dto.levels?.length) {
        await tx.competencyLevel.createMany({
          data: dto.levels.map((l) => ({ competencyId: id, ...l })),
        });
      }
    });
    await this.audit.record(actor, { entityType: 'Competency', entityId: id, action: 'create' });
    return this.get(actor, id);
  }

  async update(actor: ActorContext, id: string, dto: Partial<{ name: string; description: string; category: string }>) {
    await this.get(actor, id);
    await this.prisma.competency.update({ where: { id }, data: dto });
    await this.audit.record(actor, { entityType: 'Competency', entityId: id, action: 'edit' });
    return this.get(actor, id);
  }

  async archive(actor: ActorContext, id: string) {
    await this.get(actor, id);
    await this.prisma.competency.update({ where: { id }, data: { status: 'archived', archivedAt: new Date() } });
    await this.audit.record(actor, { entityType: 'Competency', entityId: id, action: 'archive' });
    return this.get(actor, id);
  }

  async assignToEmployee(actor: ActorContext, employeeId: string, dto: {
    competencyId: string;
    currentLevel: number;
    targetLevel?: number;
    notes?: string;
    evidenceJson?: Record<string, unknown>;
  }) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const row = await this.prisma.employeeCompetency.upsert({
      where: { employeeId_competencyId: { employeeId, competencyId: dto.competencyId } },
      create: {
        employeeId,
        competencyId: dto.competencyId,
        currentLevel: dto.currentLevel,
        targetLevel: dto.targetLevel,
        notes: dto.notes,
        evidenceJson: (dto.evidenceJson ?? undefined) as object | undefined,
        assessedBy: actor.userId,
        assessedAt: new Date(),
      },
      update: {
        currentLevel: dto.currentLevel,
        targetLevel: dto.targetLevel,
        notes: dto.notes,
        evidenceJson: (dto.evidenceJson ?? undefined) as object | undefined,
        assessedBy: actor.userId,
        assessedAt: new Date(),
      },
      include: { competency: true },
    });
    await this.audit.record(actor, { entityType: 'EmployeeCompetency', entityId: row.id, action: 'assign' });
    return row;
  }

  async setPositionRequirement(actor: ActorContext, positionDefinitionId: string, dto: {
    competencyId: string;
    requiredLevel: number;
    importance?: 'required' | 'preferred' | 'optional';
  }) {
    const row = await this.prisma.positionCompetencyRequirement.upsert({
      where: {
        positionDefinitionId_competencyId: {
          positionDefinitionId,
          competencyId: dto.competencyId,
        },
      },
      create: {
        positionDefinitionId,
        competencyId: dto.competencyId,
        requiredLevel: dto.requiredLevel,
        importance: dto.importance ?? 'required',
      },
      update: {
        requiredLevel: dto.requiredLevel,
        importance: dto.importance ?? 'required',
      },
      include: { competency: true },
    });
    await this.audit.record(actor, { entityType: 'PositionCompetencyRequirement', entityId: row.id, action: 'upsert' });
    return row;
  }

  async employeeMatrix(actor: ActorContext, employeeId: string) {
    await this.employeeAccess.assertEmployeeReadable(actor, employeeId);
    const employee = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      select: { id: true, positionDefinitionId: true, firstName: true, lastName: true },
    });
    if (!employee) throw new Error('Employee not found');

    const skills = await this.prisma.employeeCompetency.findMany({
      where: { employeeId },
      include: { competency: { include: { levels: true } } },
    });

    const requirements = employee.positionDefinitionId
      ? await this.prisma.positionCompetencyRequirement.findMany({
          where: { positionDefinitionId: employee.positionDefinitionId },
          include: { competency: true },
        })
      : [];

    const gaps = requirements.map((req) => {
      const skill = skills.find((s) => s.competencyId === req.competencyId);
      const current = skill?.currentLevel ?? 0;
      const gap = Math.max(0, req.requiredLevel - current);
      return {
        competencyId: req.competencyId,
        competencyName: req.competency.name,
        requiredLevel: req.requiredLevel,
        currentLevel: current,
        gap,
        importance: req.importance,
        suggestedTraining: gap > 0 ? `Training recommended for ${req.competency.name}` : null,
      };
    });

    return { employee, skills, requirements, gaps };
  }

  async gapAnalysisByTeam(actor: ActorContext, companyId: string, teamId?: string) {
    this.companyAccess.assertCompanyAccess(actor, companyId);
    let employeeIds: string[] | undefined;
    if (teamId) {
      const assignments = await this.prisma.employeeAssignment.findMany({
        where: { teamId, companyId, effectiveTo: null, deletedAt: null },
        select: { employeeId: true },
      });
      employeeIds = assignments.map((a) => a.employeeId);
    }

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        employmentStatus: { in: ['active', 'probation'] },
        assignments: { some: { companyId, effectiveTo: null, deletedAt: null, ...(teamId ? { teamId } : {}) } },
        ...(employeeIds ? { id: { in: employeeIds } } : {}),
      },
      select: { id: true, firstName: true, lastName: true, positionDefinitionId: true },
    });

    const results = [];
    for (const emp of employees) {
      const matrix = await this.employeeMatrix(actor, emp.id);
      const missingRequired = matrix.gaps.filter((g) => g.importance === 'required' && g.gap > 0);
      if (missingRequired.length) {
        results.push({ employeeId: emp.id, name: `${emp.firstName} ${emp.lastName}`, missingRequired });
      }
    }
    return { companyId, teamId, employeesWithGaps: results.length, details: results };
  }
}
