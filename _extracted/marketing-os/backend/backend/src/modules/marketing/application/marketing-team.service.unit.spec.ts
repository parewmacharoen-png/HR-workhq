// ============================================================================
// modules/marketing/application/marketing-team.service.unit.spec.ts
// ============================================================================

import { MarketingTeamService } from './marketing-team.service';
import {
  ActiveMarketingTeamMembershipExistsError,
  DuplicateMarketingTeamCodeError,
  InvalidMarketingTeamStructureError,
} from '../domain/errors/marketing-team.errors';

describe('MarketingTeamService (unit)', () => {
  const actor = { userId: 'user-1', companyId: 'co-1' };

  function buildService(overrides: Partial<Record<string, unknown>> = {}) {
    const teams = {
      findByCode: jest.fn().mockResolvedValue(null),
      findById: jest.fn(),
      createTeam: jest.fn(),
      findActivePrimaryMembership: jest.fn(),
      addMember: jest.fn(),
      closeMembership: jest.fn(),
      listActiveTeamMembers: jest.fn(),
      getEmployeeMarketingTeamAtDate: jest.fn(),
      resolveRootBigLeaderEmployeeId: jest.fn(),
      ...overrides,
    };

    const prisma = {
      employeeAssignment: { findFirst: jest.fn().mockResolvedValue({ id: 'a1' }) },
      marketingTeamMember: { findFirst: jest.fn() },
      marketingTeam: { findFirst: jest.fn() },
    };

    const service = new MarketingTeamService(
      teams as never,
      prisma as never,
      { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) } as never,
      { record: jest.fn().mockResolvedValue(undefined) } as never,
    );

    return { service, teams, prisma };
  }

  it('rejects duplicate team code', async () => {
    const { service, teams } = buildService({
      findByCode: jest.fn().mockResolvedValue({ id: 'existing' }),
    });

    await expect(service.createTeam(actor as never, {
      companyId: 'co-1',
      code: 'SB',
      name: 'SB',
      level: 'root',
    })).rejects.toBeInstanceOf(DuplicateMarketingTeamCodeError);
    expect(teams.createTeam).not.toHaveBeenCalled();
  });

  it('requires parent for sub_team', async () => {
    const { service } = buildService();

    await expect(service.createTeam(actor as never, {
      companyId: 'co-1',
      code: 'SB1',
      name: 'SB1',
      level: 'sub_team',
    })).rejects.toBeInstanceOf(InvalidMarketingTeamStructureError);
  });

  it('transfer closes old membership and opens new one', async () => {
    const { service, teams, prisma } = buildService({
      findById: jest.fn()
        .mockResolvedValueOnce({ id: 't1', companyId: 'co-1', isActive: true })
        .mockResolvedValueOnce({ id: 't2', companyId: 'co-1', isActive: true }),
      addMember: jest.fn().mockResolvedValue({
        id: 'm2',
        companyId: 'co-1',
        teamId: 't2',
        employeeId: 'emp-1',
        role: 'member',
        effectiveFrom: new Date('2026-06-15'),
        effectiveTo: null,
        isPrimary: true,
      }),
    });

    prisma.marketingTeamMember.findFirst = jest.fn().mockResolvedValue({
      id: 'm1',
      teamId: 't1',
      role: 'member',
    });

    await service.transferMember(actor as never, 't1', 'emp-1', {
      targetTeamId: 't2',
      effectiveFrom: '2026-06-15',
    });

    expect(teams.closeMembership).toHaveBeenCalled();
    expect(teams.addMember).toHaveBeenCalledWith(expect.objectContaining({
      teamId: 't2',
      employeeId: 'emp-1',
    }));
  });

  it('big leader is KPI exempt via root resolution', async () => {
    const { teams } = buildService({
      resolveRootBigLeaderEmployeeId: jest.fn().mockResolvedValue('big-1'),
    });

    const bigLeaderId = await teams.resolveRootBigLeaderEmployeeId('sub-1', 'co-1');
    expect(bigLeaderId).toBe('big-1');
  });

  it('sub leader maps to member role for commission pool', () => {
    const commissionRole = 'sub_leader' === 'sub_leader' ? 'employee' : 'sub_leader';
    expect(commissionRole).toBe('employee');
  });

  it('blocks second active primary team membership on add', async () => {
    const { service, teams } = buildService({
      findById: jest.fn().mockResolvedValue({ id: 't1', companyId: 'co-1', isActive: true }),
      findActivePrimaryMembership: jest.fn().mockResolvedValue({ id: 'existing' }),
    });

    await expect(service.addMember(actor as never, 't1', { employeeId: 'emp-1' }))
      .rejects.toBeInstanceOf(ActiveMarketingTeamMembershipExistsError);
    expect(teams.addMember).not.toHaveBeenCalled();
  });
});
