// ============================================================================
// modules/hierarchy/application/hierarchy.service.ts
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AuditService } from '../../../shared/audit/audit.service';
import { ActorContext } from '../../../shared/kernel/actor-context';
import { CompanyAccessService } from '../../../shared/kernel/company-access.service';
import { NotFoundError } from '../../../shared/kernel/domain-error';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import { EmployeeHierarchy } from '../domain/entities/employee-hierarchy.entity';
import {
  HIERARCHY_REPOSITORY,
  HierarchyRepository,
} from '../domain/repositories/hierarchy.repository';
import type {
  DirectReportItem,
  HierarchySummary,
  OrganizationTreeNode,
  ReportingPathNode,
  UpdateReportingLineInput,
} from '../domain/types/hierarchy.types';
import { HierarchyResolverService } from './hierarchy-resolver.service';
import { HierarchyValidationService } from './hierarchy-validation.service';

@Injectable()
export class HierarchyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly companyAccess: CompanyAccessService,
    private readonly validation: HierarchyValidationService,
    private readonly resolver: HierarchyResolverService,
    @Inject(HIERARCHY_REPOSITORY) private readonly hierarchy: HierarchyRepository,
  ) {}

  async getOrganizationTree(actor: ActorContext, companyId: string): Promise<{
    companyId: string;
    nodes: OrganizationTreeNode[];
  }> {
    await this.companyAccess.assertCompanyAccess(actor, companyId);
    const nodes = await this.resolver.buildOrganizationTree(companyId);
    return { companyId, nodes };
  }

  async getReportingPath(actor: ActorContext, employeeId: string): Promise<{
    employeeId: string;
    path: ReportingPathNode[];
  }> {
    await this.assertEmployeeReadable(actor, employeeId);
    const path = await this.resolver.getReportingPath(employeeId);
    return { employeeId, path };
  }

  async getDirectReports(actor: ActorContext, employeeId: string): Promise<{
    employeeId: string;
    items: DirectReportItem[];
    total: number;
  }> {
    await this.assertEmployeeReadable(actor, employeeId);
    const items = await this.resolver.getDirectReports(employeeId);
    return { employeeId, items, total: items.length };
  }

  async getHierarchySummary(actor: ActorContext, employeeId: string, companyId?: string): Promise<HierarchySummary> {
    await this.assertEmployeeReadable(actor, employeeId);
    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
    }
    return this.resolver.getHierarchySummary(employeeId, companyId);
  }

  async updateReportingLine(
    actor: ActorContext,
    employeeId: string,
    input: UpdateReportingLineInput,
    companyId?: string,
  ): Promise<{
    employeeId: string;
    managerEmployeeId: string | null;
    relationshipType: string;
    effectiveFrom: string;
  }> {
    await this.assertEmployeeReadable(actor, employeeId);
    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
    }

    const relationshipType = input.relationshipType ?? 'direct_manager';
    const effectiveFrom = input.effectiveFrom ? new Date(input.effectiveFrom) : new Date();

    const existing = await this.hierarchy.findActiveByEmployee(employeeId, relationshipType);
    const oldManagerId = existing?.managerEmployeeId ?? null;

    if (!input.managerEmployeeId) {
      if (existing) {
        const closed = existing.close(effectiveFrom);
        await this.hierarchy.save(closed, actor.userId);
        await this.audit.record(actor, {
          entityType: 'EmployeeHierarchy',
          entityId: existing.id,
          action: 'reporting_line_removed',
          before: { employeeId, managerEmployeeId: oldManagerId, relationshipType },
          after: { employeeId, managerEmployeeId: null, relationshipType },
        });
      }
      return {
        employeeId,
        managerEmployeeId: null,
        relationshipType,
        effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
      };
    }

    await this.validation.validateReportingLine(
      employeeId,
      input.managerEmployeeId,
      relationshipType,
      companyId,
    );

    if (existing) {
      if (existing.managerEmployeeId === input.managerEmployeeId) {
        return {
          employeeId,
          managerEmployeeId: input.managerEmployeeId,
          relationshipType,
          effectiveFrom: existing.effectiveFrom.toISOString().slice(0, 10),
        };
      }
      const closed = existing.close(effectiveFrom);
      await this.hierarchy.save(closed, actor.userId);
    }

    const created = EmployeeHierarchy.create({
      id: randomUUID(),
      employeeId,
      managerEmployeeId: input.managerEmployeeId,
      relationshipType,
      effectiveFrom,
      effectiveTo: null,
    });
    await this.hierarchy.save(created, actor.userId);

    await this.audit.record(actor, {
      entityType: 'EmployeeHierarchy',
      entityId: created.id,
      action: existing ? 'reporting_line_changed' : 'reporting_line_created',
      before: { employeeId, managerEmployeeId: oldManagerId, relationshipType },
      after: {
        employeeId,
        managerEmployeeId: input.managerEmployeeId,
        relationshipType,
        actorUserId: actor.userId,
      },
    });

    return {
      employeeId,
      managerEmployeeId: input.managerEmployeeId,
      relationshipType,
      effectiveFrom: effectiveFrom.toISOString().slice(0, 10),
    };
  }

  private async assertEmployeeReadable(actor: ActorContext, employeeId: string): Promise<void> {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: {
        id: true,
        assignments: {
          where: { effectiveTo: null, deletedAt: null, isPrimaryCompany: true },
          select: { companyId: true },
          take: 1,
        },
      },
    });
    if (!employee) throw new NotFoundError(`Employee ${employeeId} not found`);

    const companyId = employee.assignments[0]?.companyId;
    if (companyId) {
      await this.companyAccess.assertCompanyAccess(actor, companyId);
    }
  }
}
