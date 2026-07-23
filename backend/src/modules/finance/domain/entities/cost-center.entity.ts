// ============================================================================
// modules/finance/domain/entities/cost-center.entity.ts
// Hierarchical cost center scoped to a company. Used to tag revenue/expense
// transactions and to attach budgets.
// ============================================================================

export interface CostCenterProps {
  id: string;
  companyId: string;
  code: string;
  name: string;
  description: string | null;
  parentId: string | null;
  ownerEmployeeId: string | null;
  isActive: boolean;
  deletedAt: Date | null;
}

export class CostCenter {
  private constructor(private props: CostCenterProps) {}

  static rehydrate(props: CostCenterProps): CostCenter {
    return new CostCenter(props);
  }

  static create(input: {
    id: string;
    companyId: string;
    code: string;
    name: string;
    description?: string | null;
    parentId?: string | null;
    ownerEmployeeId?: string | null;
  }): CostCenter {
    const code = input.code.trim().toUpperCase();
    if (!code) throw new Error('Cost center code cannot be empty');
    if (!input.name.trim()) throw new Error('Cost center name cannot be empty');
    return new CostCenter({
      id: input.id,
      companyId: input.companyId,
      code,
      name: input.name.trim(),
      description: input.description?.trim() ?? null,
      parentId: input.parentId ?? null,
      ownerEmployeeId: input.ownerEmployeeId ?? null,
      isActive: true,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get companyId(): string { return this.props.companyId; }
  get code(): string { return this.props.code; }
  get parentId(): string | null { return this.props.parentId; }
  get isActive(): boolean { return this.props.isActive; }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Cost center name cannot be empty');
    this.props.name = trimmed;
  }

  assignOwner(employeeId: string | null): void {
    this.props.ownerEmployeeId = employeeId;
  }

  setParent(parentId: string | null): void {
    if (parentId === this.props.id) throw new Error('A cost center cannot be its own parent');
    this.props.parentId = parentId;
  }

  deactivate(): void { this.props.isActive = false; }
  activate(): void { this.props.isActive = true; }

  toPersistence(): CostCenterProps {
    return { ...this.props };
  }
}
