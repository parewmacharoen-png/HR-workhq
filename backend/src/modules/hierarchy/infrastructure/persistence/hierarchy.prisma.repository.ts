// ============================================================================
// modules/hierarchy/infrastructure/persistence/hierarchy.prisma.repository.ts
// ============================================================================

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../../shared/prisma/prisma.service';
import { EmployeeHierarchy } from '../../domain/entities/employee-hierarchy.entity';
import type { HierarchyRelationshipType } from '../../domain/types/hierarchy.types';
import type { HierarchyRepository } from '../../domain/repositories/hierarchy.repository';

@Injectable()
export class PrismaHierarchyRepository implements HierarchyRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findActiveByEmployee(
    employeeId: string,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<EmployeeHierarchy | null> {
    const row = await this.prisma.employeeHierarchy.findFirst({
      where: {
        employeeId,
        relationshipType,
        effectiveTo: null,
        deletedAt: null,
      },
      orderBy: { effectiveFrom: 'desc' },
    });
    return row ? this.toDomain(row) : null;
  }

  async findActiveByManager(
    managerEmployeeId: string,
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<EmployeeHierarchy[]> {
    const rows = await this.prisma.employeeHierarchy.findMany({
      where: {
        managerEmployeeId,
        relationshipType,
        effectiveTo: null,
        deletedAt: null,
      },
      orderBy: { effectiveFrom: 'asc' },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async findAllActive(
    relationshipType: HierarchyRelationshipType = 'direct_manager',
  ): Promise<EmployeeHierarchy[]> {
    const rows = await this.prisma.employeeHierarchy.findMany({
      where: {
        relationshipType,
        effectiveTo: null,
        deletedAt: null,
      },
    });
    return rows.map((row) => this.toDomain(row));
  }

  async save(record: EmployeeHierarchy, actorUserId: string): Promise<void> {
    const data = record.toPersistence();
    await this.prisma.employeeHierarchy.upsert({
      where: { id: data.id },
      create: {
        id: data.id,
        employeeId: data.employeeId,
        managerEmployeeId: data.managerEmployeeId,
        relationshipType: data.relationshipType,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
      update: {
        managerEmployeeId: data.managerEmployeeId,
        relationshipType: data.relationshipType,
        effectiveFrom: data.effectiveFrom,
        effectiveTo: data.effectiveTo,
        updatedBy: actorUserId,
      },
    });
  }

  private toDomain(row: {
    id: string;
    employeeId: string;
    managerEmployeeId: string;
    relationshipType: HierarchyRelationshipType;
    effectiveFrom: Date;
    effectiveTo: Date | null;
  }): EmployeeHierarchy {
    return EmployeeHierarchy.fromPersistence({
      id: row.id,
      employeeId: row.employeeId,
      managerEmployeeId: row.managerEmployeeId,
      relationshipType: row.relationshipType,
      effectiveFrom: row.effectiveFrom,
      effectiveTo: row.effectiveTo,
    });
  }
}
