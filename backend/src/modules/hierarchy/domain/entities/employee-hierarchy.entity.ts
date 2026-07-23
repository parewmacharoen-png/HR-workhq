// ============================================================================
// modules/hierarchy/domain/entities/employee-hierarchy.entity.ts
// ============================================================================

import type { HierarchyRelationshipType } from '../types/hierarchy.types';

export interface EmployeeHierarchyProps {
  id: string;
  employeeId: string;
  managerEmployeeId: string;
  relationshipType: HierarchyRelationshipType;
  effectiveFrom: Date;
  effectiveTo: Date | null;
}

export class EmployeeHierarchy {
  private constructor(private readonly props: EmployeeHierarchyProps) {}

  static create(props: EmployeeHierarchyProps): EmployeeHierarchy {
    return new EmployeeHierarchy(props);
  }

  static fromPersistence(row: EmployeeHierarchyProps): EmployeeHierarchy {
    return new EmployeeHierarchy(row);
  }

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get managerEmployeeId(): string { return this.props.managerEmployeeId; }
  get relationshipType(): HierarchyRelationshipType { return this.props.relationshipType; }
  get effectiveFrom(): Date { return this.props.effectiveFrom; }
  get effectiveTo(): Date | null { return this.props.effectiveTo; }

  isActive(at = new Date()): boolean {
    if (this.props.effectiveTo && this.props.effectiveTo < at) return false;
    return this.props.effectiveFrom <= at;
  }

  close(at: Date): EmployeeHierarchy {
    return new EmployeeHierarchy({ ...this.props, effectiveTo: at });
  }

  toPersistence(): EmployeeHierarchyProps {
    return { ...this.props };
  }
}
