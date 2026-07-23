// ============================================================================
// modules/organization/domain/entities/company.entity.ts
// Rich domain entity. Holds invariants; persistence-agnostic.
// ============================================================================

export interface CompanyProps {
  id: string;
  code: string;
  name: string;
  legalName: string | null;
  timezone: string;
  isActive: boolean;
  deletedAt: Date | null;
}

export class Company {
  private constructor(private props: CompanyProps) {}

  static rehydrate(props: CompanyProps): Company {
    return new Company(props);
  }

  static create(input: {
    id: string;
    code: string;
    name: string;
    legalName?: string | null;
    timezone?: string;
  }): Company {
    const code = input.code.trim().toUpperCase();
    if (!/^[A-Z0-9]{1,8}$/.test(code)) {
      throw new Error('Company code must be 1-8 alphanumeric characters');
    }
    return new Company({
      id: input.id,
      code,
      name: input.name.trim(),
      legalName: input.legalName?.trim() ?? null,
      timezone: input.timezone ?? 'Asia/Bangkok',
      isActive: true,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get code(): string { return this.props.code; }
  get name(): string { return this.props.name; }
  get isActive(): boolean { return this.props.isActive; }
  get isDeleted(): boolean { return this.props.deletedAt !== null; }

  rename(name: string): void {
    const trimmed = name.trim();
    if (!trimmed) throw new Error('Company name cannot be empty');
    this.props.name = trimmed;
  }

  deactivate(): void { this.props.isActive = false; }
  activate(): void { this.props.isActive = true; }

  toPersistence(): CompanyProps {
    return { ...this.props };
  }
}
