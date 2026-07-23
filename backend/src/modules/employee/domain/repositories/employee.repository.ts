// ============================================================================
// modules/employee/domain/repositories/employee.repository.ts
// ============================================================================

import { Employee } from '../entities/employee.entity';
import { EmployeeAssignment } from '../entities/employee-assignment.entity';

export const EMPLOYEE_REPOSITORY = Symbol('EMPLOYEE_REPOSITORY');
export const ASSIGNMENT_REPOSITORY = Symbol('ASSIGNMENT_REPOSITORY');

export interface EmployeeRepository {
  findById(id: string): Promise<Employee | null>;
  findByGlobalId(globalId: string): Promise<Employee | null>;
  existsGlobalId(globalId: string): Promise<boolean>;
  save(employee: Employee, actorUserId: string): Promise<void>;
  softDelete(id: string, actorUserId: string): Promise<void>;
}

export interface AssignmentRepository {
  findById(id: string): Promise<EmployeeAssignment | null>;
  listByEmployee(employeeId: string): Promise<EmployeeAssignment[]>;
  /** Current (effectiveTo IS NULL) assignments for an employee in a company. */
  findCurrentForCompany(employeeId: string, companyId: string): Promise<EmployeeAssignment[]>;
  /** The current primary-company assignment, if any. */
  findCurrentPrimaryCompany(employeeId: string): Promise<EmployeeAssignment | null>;
  save(assignment: EmployeeAssignment, actorUserId: string): Promise<void>;
}
