import { EmployeeCommissionService } from './employee-commission.service';
import { EmployeeCommissionViewService } from '../../commission/application/employee-commission-view.service';

describe('EmployeeCommissionService', () => {
  const actor = { userId: 'u-1', impersonatorUserId: null, companyId: 'co-1' };

  it('delegates to EmployeeCommissionViewService without duplicating calculations', async () => {
    const view = {
      summary: {
        currentCycleLabel: '2026-05-25 – 2026-06-23',
        estimatedCommission: 12000,
        lastPaidCommission: 10000,
        currentTeamName: 'Team Alpha',
        commissionMethod: 'Team Pool',
        eligibleStatus: 'Eligible',
        carryForwardStatus: 'None',
        targetProgress: '20/24',
        commissionStatus: 'pending_pay',
      },
      assignment: {
        companyId: 'co-1',
        companyName: 'Acme',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        businessRole: 'employee',
        commissionMethod: 'Team Pool',
        rampPercent: 100,
        eligibilityPercent: 100,
        bigLeaderPercent: null,
        employeePercent: null,
        target: 24,
        carryForward: null,
        engine: 'marketing' as const,
      },
      history: [{
        id: 'mkt-1',
        sourceCycleId: 'cycle-1',
        finalizationCycleId: 'fin-1',
        periodStart: '2026-05-25',
        periodEnd: '2026-06-23',
        periodLabel: '2026-05-25 – 2026-06-23',
        companyId: 'co-1',
        companyName: 'Acme',
        teamId: 'team-1',
        teamName: 'Team Alpha',
        commissionType: 'marketing' as const,
        method: 'Team Pool',
        target: 24,
        achieved: 20,
        commission: 12000,
        bonus: 500,
        carryForward: 0,
        status: 'pending_pay',
        uiStatus: 'pending' as const,
      }],
    };

    const commissionView = {
      getEmployeeCommissionView: jest.fn().mockResolvedValue(view),
    };
    const employeeAccess = {
      assertEmployeeReadable: jest.fn(),
    };

    const service = new EmployeeCommissionService(
      commissionView as unknown as EmployeeCommissionViewService,
      employeeAccess as never,
    );

    const result = await service.getCommission(actor, 'emp-1', 'co-1');
    expect(employeeAccess.assertEmployeeReadable).toHaveBeenCalledWith(actor, 'emp-1');
    expect(commissionView.getEmployeeCommissionView).toHaveBeenCalledWith(actor, 'emp-1', 'co-1');
    expect(result.summary.estimatedCommission).toBe(12000);
    expect(result.history[0].commission).toBe(12000);
  });
});
