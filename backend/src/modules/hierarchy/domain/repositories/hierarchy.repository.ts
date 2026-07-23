// ============================================================================
// modules/hierarchy/domain/repositories/hierarchy.repository.ts
// ============================================================================

import type { EmployeeHierarchy } from '../entities/employee-hierarchy.entity';
import type { HierarchyRelationshipType } from '../types/hierarchy.types';

export const HIERARCHY_REPOSITORY = Symbol('HIERARCHY_REPOSITORY');

export interface HierarchyRepository {
  findActiveByEmployee(
    employeeId: string,
    relationshipType?: HierarchyRelationshipType,
  ): Promise<EmployeeHierarchy | null>;

  findActiveByManager(
    managerEmployeeId: string,
    relationshipType?: HierarchyRelationshipType,
  ): Promise<EmployeeHierarchy[]>;

  findAllActive(relationshipType?: HierarchyRelationshipType): Promise<EmployeeHierarchy[]>;

  save(record: EmployeeHierarchy, actorUserId: string): Promise<void>;
}
