// ============================================================================
// modules/employee/application/employee.service.list-companies.unit.spec.ts
// One person working in several companies is listed once, with company badges.
// ============================================================================

import { EmployeeService } from './employee.service';

const company = (id: string, code: string) => ({ id, code, name: `${code} Company` });

const assignment = (companyId: string, code: string, isPrimaryCompany: boolean, team: string | null = null) => ({
  companyId,
  teamId: team ? `team-${team}` : null,
  team: team ? { name: team } : null,
  isPrimaryCompany,
  company: company(companyId, code),
});

const row = {
  id: 'emp-1',
  globalId: 'EMP000010',
  firstName: 'Somchai',
  lastName: 'Jaidee',
  employmentStatus: 'active',
  hireDate: new Date('2025-01-01'),
  assignments: [
    assignment('co-sb', 'SB', true, 'Sales'),
    assignment('co-mb', 'MB', false, 'Ops'),
    assignment('co-kw', 'KW', false),
  ],
  users: [],
};

describe('EmployeeService.listEmployees company badges (unit)', () => {
  const prisma = { employee: { findMany: jest.fn().mockResolvedValue([row]) } };
  const companyAccess = {
    assertCompanyAccess: jest.fn().mockResolvedValue(undefined),
    hasAllScope: jest.fn(),
    hasCompanyScope: jest.fn(),
  };
  const employeeEvents = { buildTenureInfo: jest.fn().mockReturnValue({ hireDate: '2025-01-01' }) };

  const service = new EmployeeService(
    {} as never, {} as never, {} as never, {} as never,
    prisma as never,
    companyAccess as never,
    {} as never, {} as never,
    employeeEvents as never,
    {} as never, {} as never, {} as never, {} as never,
  );
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-mb' };

  beforeEach(() => jest.clearAllMocks());

  it('lists every company (primary first) for an all-scope viewer, team from the requested company', async () => {
    companyAccess.hasAllScope.mockResolvedValue(true);

    const { items } = await service.listEmployees(actor as never, 'co-mb');

    expect(items).toHaveLength(1);
    expect(items[0].companies.map((c) => c.code)).toEqual(['SB', 'MB', 'KW']);
    expect(items[0].companies[0].isPrimary).toBe(true);
    expect(items[0].teamName).toBe('Ops');
  });

  it('hides companies the viewer has no scope for', async () => {
    companyAccess.hasAllScope.mockResolvedValue(false);
    companyAccess.hasCompanyScope.mockImplementation(async (_u: string, id: string) => id !== 'co-kw');

    const { items } = await service.listEmployees(actor as never, 'co-mb');

    expect(items[0].companies.map((c) => c.code)).toEqual(['SB', 'MB']);
  });

  it('still filters the list to people assigned to the requested company', async () => {
    companyAccess.hasAllScope.mockResolvedValue(true);

    await service.listEmployees(actor as never, 'co-mb');

    const where = prisma.employee.findMany.mock.calls[0][0].where;
    expect(where.assignments).toEqual({ some: { companyId: 'co-mb', effectiveTo: null, deletedAt: null } });
  });
});
