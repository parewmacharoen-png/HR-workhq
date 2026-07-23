import { EmployeeCommissionViewService } from './employee-commission-view.service';

describe('EmployeeCommissionViewService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  it('maps marketing and admin history from persisted results without recalculating', async () => {
    const employeeAccess = {
      assertEmployeeSelfOrCompany: jest.fn(),
    };
    const prisma = {
      company: {
        findFirst: jest.fn().mockResolvedValue({ id: 'co-1', name: 'Acme' }),
      },
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: 'emp-1' }),
      },
      adminCommissionEmployeeProfile: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
      marketingTeamMember: {
        findFirst: jest.fn().mockResolvedValue({
          role: 'member',
          team: { id: 'team-1', name: 'Team Alpha', companyId: 'co-1' },
        }),
      },
      commissionDeclaration: {
        findFirst: jest.fn().mockResolvedValue({
          status: 'approved',
          assignments: [{
            companyId: 'co-1',
            teamId: 'team-1',
            commissionMethod: 'team_pool',
            bigLeaderPercent: null,
            employeePercent: null,
            company: { name: 'Acme' },
            team: { id: 'team-1', name: 'Team Alpha' },
          }],
        }),
      },
      marketingCommissionCarryForward: {
        findMany: jest.fn().mockResolvedValue([]),
      },
      marketingCommissionMemberResult: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'mkt-1',
          cycleId: 'm-cycle-1',
          targetCandidates: 24,
          achievedCandidates: 20,
          kpiQualified: true,
          rampPercent: 1,
          finalPayout: 12000,
          redistributionBonus: 500,
          carryForwardOut: 0,
          status: 'pending_pay',
          cycle: {
            companyId: 'co-1',
            teamId: 'team-1',
            earnCycleId: 'earn-1',
            company: { id: 'co-1', name: 'Acme' },
            team: { id: 'team-1', name: 'Team Alpha' },
            earnCycle: {
              periodStart: new Date('2026-05-25'),
              periodEnd: new Date('2026-06-23'),
            },
          },
        }]),
      },
      adminCommissionMemberResult: {
        findMany: jest.fn().mockResolvedValue([{
          id: 'adm-1',
          cycleId: 'a-cycle-1',
          officeType: 'front_office',
          daysWorkedInCycle: 22,
          finalPayout: 8000,
          redistributionBonus: 0,
          status: 'paid',
          cycle: {
            companyId: 'co-1',
            earnCycleId: 'earn-0',
            company: { id: 'co-1', name: 'Acme' },
            earnCycle: {
              periodStart: new Date('2026-04-25'),
              periodEnd: new Date('2026-05-23'),
            },
          },
        }]),
      },
      payrollCycle: {
        findFirst: jest.fn().mockResolvedValue({
          id: 'earn-1',
          periodStart: new Date('2026-05-25'),
          periodEnd: new Date('2026-06-23'),
        }),
      },
      commissionCycle: {
        findMany: jest.fn().mockResolvedValue([
          { id: 'fin-m', sourceCycleId: 'm-cycle-1' },
          { id: 'fin-a', sourceCycleId: 'a-cycle-1' },
        ]),
      },
    };

    const service = new EmployeeCommissionViewService(
      prisma as never,
      employeeAccess as never,
    );

    const result = await service.getEmployeeCommissionView(actor, 'emp-1', 'co-1');
    expect(employeeAccess.assertEmployeeSelfOrCompany).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(result.summary.estimatedCommission).toBe(12000);
    expect(result.assignment?.engine).toBe('marketing');
    expect(result.history).toHaveLength(2);
    expect(result.history.find((row) => row.commissionType === 'marketing')?.commission).toBe(12000);
    expect(result.history.find((row) => row.commissionType === 'admin')?.uiStatus).toBe('paid');
  });
});
