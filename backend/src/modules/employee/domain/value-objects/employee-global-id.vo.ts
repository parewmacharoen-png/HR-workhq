// ============================================================================
// modules/employee/domain/value-objects/employee-global-id.vo.ts
// Global, company-agnostic employee identifier: EMP000001.
// ============================================================================

export class EmployeeGlobalId {
  private static readonly PATTERN = /^EMP\d{6}$/;

  private constructor(public readonly value: string) {}

  static fromString(value: string): EmployeeGlobalId {
    if (!EmployeeGlobalId.PATTERN.test(value)) {
      throw new Error(`Invalid employee global id "${value}" (expected EMP000001)`);
    }
    return new EmployeeGlobalId(value);
  }

  /** Build from a sequence number, e.g. 1 -> EMP000001. */
  static fromSequence(seq: number): EmployeeGlobalId {
    if (!Number.isInteger(seq) || seq < 1 || seq > 999999) {
      throw new Error('Employee sequence must be between 1 and 999999');
    }
    return new EmployeeGlobalId(`EMP${seq.toString().padStart(6, '0')}`);
  }

  equals(other: EmployeeGlobalId): boolean {
    return this.value === other.value;
  }

  toString(): string {
    return this.value;
  }
}
