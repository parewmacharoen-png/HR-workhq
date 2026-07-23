import { EmployeeEmploymentService } from './employee-employment.service';

describe('EmployeeEmploymentService change tracking', () => {
  it('records employment field changes and audit on update', async () => {
    const createHistory = jest.fn();
    const auditRecord = jest.fn();
    const prisma = {
      employee: {
        findFirstOrThrow: jest.fn().mockResolvedValue({
          id: 'emp-1',
          department: 'HR',
          position: 'Officer',
          employmentType: 'permanent',
          employmentStatus: 'active',
          hireDate: new Date('2020-01-01'),
          probationEndDate: null,
          terminationDate: null,
          workCategory: 'office',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'emp-1',
          department: 'Finance',
          position: 'Officer',
          employmentType: 'permanent',
          employmentStatus: 'active',
          hireDate: new Date('2020-01-01'),
          probationEndDate: null,
          terminationDate: null,
          workCategory: 'office',
        }),
        findFirst: jest.fn(),
      },
      employeeAssignment: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'assign-1',
          companyId: 'co-1',
          teamId: 'team-1',
        }),
      },
      employeeHierarchy: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      adminCommissionEmployeeProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      employeeChangeHistory: { create: createHistory },
    };

    const service = new EmployeeEmploymentService(
      prisma as never,
      { record: auditRecord } as never,
      {
        assertEmployeeReadable: jest.fn(),
        assertEmployeeInCompany: jest.fn(),
      } as never,
      { assertOwnerOrSecretary: jest.fn().mockResolvedValue('co-1') } as never,
      { getEmployeeAccessContext: jest.fn().mockResolvedValue({ businessRole: 'employee' }) } as never,
      { resolveEditorPermissions: jest.fn().mockResolvedValue({ canEditBusinessRole: false, canAssignOwnerRole: false }) } as never,
      {
        getDirectManager: jest.fn(),
        getBigLeader: jest.fn(),
      } as never,
      { getShiftProfile: jest.fn().mockResolvedValue({ current: null, nextScheduled: null, history: [] }) } as never,
      { findCurrentForCompany: jest.fn(), save: jest.fn() } as never,
      { assign: jest.fn() } as never,
      { syncEmployeeOpenCyclesAllCompanies: jest.fn() } as never,
    );

    jest.spyOn(service, 'getEmployment').mockResolvedValue({ employment: {}, supervisor: null, bigLeader: null, subLeader: null } as never);

    await service.updateEmployment(
      { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' },
      'emp-1',
      { department: 'Finance' },
      'co-1',
    );

    expect(createHistory).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          changeType: 'employment',
          fieldName: 'department',
        }),
      }),
    );
    expect(auditRecord).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'employee_employment_updated' }),
    );
  });
});
