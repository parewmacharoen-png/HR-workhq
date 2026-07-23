// ============================================================================
// modules/employee/application/employee.service.access.unit.spec.ts
// HR-013c — GET /employees/:id actor scope.
// ============================================================================

import { EmployeeService } from './employee.service';
import { EmployeeNotFoundError } from '../domain/errors/employee.errors';

describe('EmployeeService access (unit)', () => {
  const employees = { findById: jest.fn() };
  const assignments = { listByEmployee: jest.fn().mockResolvedValue([]) };
  const employeeAccess = { assertEmployeeReadable: jest.fn().mockResolvedValue('co-1') };
  const employeeEvents = { buildProfileDates: jest.fn().mockReturnValue({ hireDate: '2025-01-01' }) };

  const service = new EmployeeService(
    employees as never,
    assignments as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    {} as never,
    employeeEvents as never,
    employeeAccess as never,
  );

  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-1' };

  beforeEach(() => {
    jest.clearAllMocks();
    employeeAccess.assertEmployeeReadable.mockResolvedValue('co-1');
  });

  it('asserts employee readable before getEmployee', async () => {
    employees.findById.mockResolvedValue({
      toPersistence: () => ({
        id: 'emp-1',
        globalId: 'EMP000001',
        firstName: 'A',
        lastName: 'B',
        employmentStatus: 'active',
        hireDate: new Date('2025-01-01'),
        dateOfBirth: null,
      }),
    });

    await service.getEmployee(actor, 'emp-1');

    expect(employeeAccess.assertEmployeeReadable).toHaveBeenCalledWith(actor, 'emp-1');
  });

  it('asserts employee readable before listAssignments', async () => {
    await service.listAssignments(actor, 'emp-1');

    expect(employeeAccess.assertEmployeeReadable).toHaveBeenCalledWith(actor, 'emp-1');
  });

  it('throws when employee not found after access check', async () => {
    employees.findById.mockResolvedValue(null);

    await expect(service.getEmployee(actor, 'emp-missing')).rejects.toBeInstanceOf(EmployeeNotFoundError);
  });
});
