// ============================================================================
// modules/employee/domain/entities/employee-assignment.entity.ts
// One row per (employee, company, team) over a time window. Closing an
// assignment sets effectiveTo. Primary flags enforced one-active at the
// service/DB level; the entity guards date sanity.
// ============================================================================

import { RoleLevel } from '../../../organization/domain/entities/team.entity';

export interface EmployeeAssignmentProps {
  id: string;
  employeeId: string;
  companyId: string;
  teamId: string | null;
  functionId: string | null;
  roleLevel: RoleLevel;
  isPrimaryCompany: boolean;
  isPrimaryTeam: boolean;
  effectiveFrom: Date;
  effectiveTo: Date | null;
  deletedAt: Date | null;
}

export class EmployeeAssignment {
  private constructor(private props: EmployeeAssignmentProps) {}

  static rehydrate(props: EmployeeAssignmentProps): EmployeeAssignment {
    return new EmployeeAssignment(props);
  }

  static create(input: {
    id: string;
    employeeId: string;
    companyId: string;
    effectiveFrom: Date;
    teamId?: string | null;
    functionId?: string | null;
    roleLevel?: RoleLevel;
    isPrimaryCompany?: boolean;
    isPrimaryTeam?: boolean;
  }): EmployeeAssignment {
    return new EmployeeAssignment({
      id: input.id,
      employeeId: input.employeeId,
      companyId: input.companyId,
      teamId: input.teamId ?? null,
      functionId: input.functionId ?? null,
      roleLevel: input.roleLevel ?? 'employee',
      isPrimaryCompany: input.isPrimaryCompany ?? false,
      isPrimaryTeam: input.isPrimaryTeam ?? false,
      effectiveFrom: input.effectiveFrom,
      effectiveTo: null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get employeeId(): string { return this.props.employeeId; }
  get companyId(): string { return this.props.companyId; }
  get isCurrent(): boolean { return this.props.effectiveTo === null; }
  get isPrimaryCompany(): boolean { return this.props.isPrimaryCompany; }

  close(effectiveTo: Date): void {
    if (effectiveTo < this.props.effectiveFrom) {
      throw new Error('effectiveTo cannot precede effectiveFrom');
    }
    this.props.effectiveTo = effectiveTo;
    // a closed assignment can no longer be the primary
    this.props.isPrimaryCompany = false;
    this.props.isPrimaryTeam = false;
  }

  promoteTo(roleLevel: RoleLevel): void {
    this.props.roleLevel = roleLevel;
  }

  toPersistence(): EmployeeAssignmentProps {
    return { ...this.props };
  }
}
