// ============================================================================
// modules/employee/domain/entities/employee.entity.ts
// Employee aggregate root. Holds identity + lifecycle status. Rehire is modeled
// as a NEW employee record linked back via rehireOfEmployeeId (per spec).
// ============================================================================

import { EmployeeGlobalId } from '../value-objects/employee-global-id.vo';
import { CannotRehireActiveEmployeeError } from '../errors/employee.errors';

export type EmploymentStatus = 'probation' | 'active' | 'suspended' | 'terminated';
export type EmployeeWorkCategory = 'office' | 'wfh';

export interface EmployeeProps {
  id: string;
  globalId: EmployeeGlobalId;
  firstName: string;
  lastName: string;
  nickname: string | null;
  nationalId: string | null;
  phone: string | null;
  email: string | null;
  department: string | null;
  position: string | null;
  employmentType: string | null;
  dateOfBirth: Date | null;
  hireDate: Date;
  probationEndDate: Date | null;
  terminationDate: Date | null;
  employmentStatus: EmploymentStatus;
  workCategory: EmployeeWorkCategory;
  rehireOfEmployeeId: string | null;
  deletedAt: Date | null;
}

export class Employee {
  private constructor(private props: EmployeeProps) {}

  static rehydrate(props: EmployeeProps): Employee {
    return new Employee(props);
  }

  static create(input: {
    id: string;
    globalId: EmployeeGlobalId;
    firstName: string;
    lastName: string;
    hireDate: Date;
    nickname?: string | null;
    nationalId?: string | null;
    phone?: string | null;
    email?: string | null;
    department?: string | null;
    position?: string | null;
    employmentType?: string | null;
    dateOfBirth?: Date | null;
    probationEndDate?: Date | null;
    workCategory?: EmployeeWorkCategory;
    rehireOfEmployeeId?: string | null;
  }): Employee {
    if (!input.firstName.trim() || !input.lastName.trim()) {
      throw new Error('Employee must have first and last name');
    }
    return new Employee({
      id: input.id,
      globalId: input.globalId,
      firstName: input.firstName.trim(),
      lastName: input.lastName.trim(),
      nickname: input.nickname ?? null,
      nationalId: input.nationalId ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      department: input.department ?? null,
      position: input.position ?? null,
      employmentType: input.employmentType ?? null,
      dateOfBirth: input.dateOfBirth ?? null,
      hireDate: input.hireDate,
      probationEndDate: input.probationEndDate ?? null,
      terminationDate: null,
      employmentStatus: 'probation',
      workCategory: input.workCategory ?? 'office',
      rehireOfEmployeeId: input.rehireOfEmployeeId ?? null,
      deletedAt: null,
    });
  }

  get id(): string { return this.props.id; }
  get globalId(): string { return this.props.globalId.value; }
  get status(): EmploymentStatus { return this.props.employmentStatus; }
  get isTerminated(): boolean { return this.props.employmentStatus === 'terminated'; }

  confirmProbationPassed(): void {
    if (this.props.employmentStatus === 'probation') {
      this.props.employmentStatus = 'active';
    }
  }

  suspend(): void {
    if (this.props.employmentStatus === 'terminated') {
      throw new Error('Cannot suspend a terminated employee');
    }
    this.props.employmentStatus = 'suspended';
  }

  reinstate(): void {
    if (this.props.employmentStatus === 'suspended') {
      this.props.employmentStatus = 'active';
    }
  }

  terminate(at: Date): void {
    this.props.employmentStatus = 'terminated';
    this.props.terminationDate = at;
  }

  /** Validates that THIS (old) record can be the source of a rehire. */
  assertRehirable(): void {
    if (this.props.employmentStatus !== 'terminated') {
      throw new CannotRehireActiveEmployeeError();
    }
  }

  updateProfile(input: {
    phone?: string | null;
    email?: string | null;
    nickname?: string | null;
    department?: string | null;
    position?: string | null;
    employmentType?: string | null;
    workCategory?: EmployeeWorkCategory;
  }): void {
    if (input.phone !== undefined) this.props.phone = input.phone;
    if (input.email !== undefined) this.props.email = input.email;
    if (input.nickname !== undefined) this.props.nickname = input.nickname;
    if (input.department !== undefined) this.props.department = input.department;
    if (input.position !== undefined) this.props.position = input.position;
    if (input.employmentType !== undefined) this.props.employmentType = input.employmentType;
    if (input.workCategory !== undefined) this.props.workCategory = input.workCategory;
  }

  updateContact(input: { phone?: string | null; email?: string | null; nickname?: string | null }): void {
    this.updateProfile(input);
  }

  toPersistence(): Omit<EmployeeProps, 'globalId'> & { globalId: string } {
    return { ...this.props, globalId: this.props.globalId.value };
  }
}
