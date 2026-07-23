// ============================================================================
// modules/exit/domain/repositories/exit-case.repository.ts
// ============================================================================

import { EmployeeExitCase } from '../entities/employee-exit-case.entity';

export const EXIT_CASE_REPOSITORY = Symbol('EXIT_CASE_REPOSITORY');

export interface ExitCaseRepository {
  findById(id: string): Promise<EmployeeExitCase | null>;
  findOpenForEmployee(employeeId: string, companyId: string): Promise<EmployeeExitCase | null>;
  listByEmployee(employeeId: string): Promise<EmployeeExitCase[]>;
  save(record: EmployeeExitCase): Promise<void>;
}
