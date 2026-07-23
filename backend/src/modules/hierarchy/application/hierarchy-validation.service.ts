// ============================================================================
// modules/hierarchy/application/hierarchy-validation.service.ts
// ============================================================================

import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../../shared/prisma/prisma.service';
import {
  CircularHierarchyNotAllowedError,
  CompanyScopeConsistencyError,
  OwnerCannotHaveManagerError,
  SelfReportingNotAllowedError,
} from '../domain/errors/hierarchy.errors';
import {
  HIERARCHY_REPOSITORY,
  HierarchyRepository,
} from '../domain/repositories/hierarchy.repository';
import type { HierarchyRelationshipType } from '../domain/types/hierarchy.types';

@Injectable()
export class HierarchyValidationService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(HIERARCHY_REPOSITORY) private readonly hierarchy: HierarchyRepository,
  ) {}

  async validateReportingLine(
    employeeId: string,
    managerEmployeeId: string | null,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
    companyId?: string,
  ): Promise<void> {
    if (!managerEmployeeId) return;

    if (employeeId === managerEmployeeId) {
      throw new SelfReportingNotAllowedError();
    }

    await this.assertEmployeesExist(employeeId, managerEmployeeId);
    await this.assertNotOwnerWithManager(employeeId);
    await this.assertCompanyConsistency(employeeId, managerEmployeeId, companyId);
    await this.assertNoCircularHierarchy(employeeId, managerEmployeeId, relationshipType);
  }

  private async assertEmployeesExist(employeeId: string, managerEmployeeId: string): Promise<void> {
    const rows = await this.prisma.employee.findMany({
      where: { id: { in: [employeeId, managerEmployeeId] }, deletedAt: null },
      select: { id: true },
    });
    if (rows.length !== 2) {
      throw new SelfReportingNotAllowedError();
    }
  }

  private async assertNotOwnerWithManager(employeeId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { employeeId, deletedAt: null, isActive: true },
      select: { id: true },
    });
    if (!user) return;

    const ownerRole = await this.prisma.businessRoleAssignment.findFirst({
      where: {
        userId: user.id,
        role: 'owner',
        isActive: true,
        deletedAt: null,
      },
    });
    if (ownerRole) {
      throw new OwnerCannotHaveManagerError();
    }
  }

  private async assertCompanyConsistency(
    employeeId: string,
    managerEmployeeId: string,
    companyId?: string,
  ): Promise<void> {
    const assignments = await this.prisma.employeeAssignment.findMany({
      where: {
        employeeId: { in: [employeeId, managerEmployeeId] },
        effectiveTo: null,
        deletedAt: null,
        ...(companyId ? { companyId } : {}),
      },
      select: { employeeId: true, companyId: true },
    });

    const employeeCompanies = new Set(
      assignments.filter((a) => a.employeeId === employeeId).map((a) => a.companyId),
    );
    const managerCompanies = new Set(
      assignments.filter((a) => a.employeeId === managerEmployeeId).map((a) => a.companyId),
    );

    const shared = [...employeeCompanies].some((id) => managerCompanies.has(id));
    if (!shared) {
      throw new CompanyScopeConsistencyError();
    }
  }

  private async assertNoCircularHierarchy(
    employeeId: string,
    managerEmployeeId: string,
    relationshipType: HierarchyRelationshipType,
  ): Promise<void> {
    const visited = new Set<string>([employeeId]);
    let currentId: string | null = managerEmployeeId;

    while (currentId) {
      if (visited.has(currentId)) {
        throw new CircularHierarchyNotAllowedError();
      }
      visited.add(currentId);

      const next = await this.hierarchy.findActiveByEmployee(currentId, relationshipType);
      currentId = next?.managerEmployeeId ?? null;
    }
  }
}
