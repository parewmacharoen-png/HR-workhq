// ============================================================================
// modules/organization/domain/entities/team.entity.ts
// ============================================================================

export type RoleLevel = 'employee' | 'sub_leader' | 'big_leader';

export interface TeamProps {
  id: string;
  companyId: string;
  functionId: string | null;
  name: string;
  parentTeamId: string | null;
  bigLeaderEmployeeId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}

export class Team {
  private constructor(private props: TeamProps) {}

  static rehydrate(props: TeamProps): Team {
    return new Team(props);
  }

  static create(input: {
    id: string;
    companyId: string;
    name: string;
    functionId?: string | null;
    parentTeamId?: string | null;
    bigLeaderEmployeeId?: string | null;
  }): Team {
    const name = input.name.trim();
    if (!name) throw new Error('Team name cannot be empty');
    return new Team({
      id: input.id,
      companyId: input.companyId,
      functionId: input.functionId ?? null,
      name,
      parentTeamId: input.parentTeamId ?? null,
      bigLeaderEmployeeId: input.bigLeaderEmployeeId ?? null,
      isActive: true,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get companyId(): string { return this.props.companyId; }
  get name(): string { return this.props.name; }
  get parentTeamId(): string | null { return this.props.parentTeamId; }

  assignBigLeader(employeeId: string): void {
    this.props.bigLeaderEmployeeId = employeeId;
  }

  setParent(parentTeamId: string | null): void {
    if (parentTeamId === this.props.id) {
      throw new Error('A team cannot be its own parent');
    }
    this.props.parentTeamId = parentTeamId;
  }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Team name cannot be empty');
    this.props.name = trimmed;
  }

  toPersistence(): TeamProps {
    return { ...this.props };
  }
}
