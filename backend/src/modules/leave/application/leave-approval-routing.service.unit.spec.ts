import { LeaveApprovalRoutingService } from './leave-approval-routing.service';

describe('LeaveApprovalRoutingService.resolveRoute', () => {
  const service = new LeaveApprovalRoutingService({} as never);

  const marketingStaff = {
    employeeId: 'e1',
    companyId: 'c1',
    department: 'Marketing',
    roleLevel: 'employee',
    departmentRoute: 'marketing' as const,
    roleBand: 'staff' as const,
  };

  const marketingBigLeader = {
    ...marketingStaff,
    roleLevel: 'big_leader',
    roleBand: 'big_leader' as const,
  };

  const adminStaff = {
    ...marketingStaff,
    department: 'Admin',
    departmentRoute: 'admin' as const,
  };

  it('routes marketing staff personal leave to big leader', () => {
    const route = service.resolveRoute('personal', marketingStaff);
    expect(route.approverType).toBe('requester_big_leader');
    expect(route.notifyTeam).toBe(true);
  });

  it('routes marketing big leader personal leave to owner', () => {
    const route = service.resolveRoute('personal', marketingBigLeader);
    expect(route.approverType).toBe('owner');
  });

  it('routes admin personal leave to secretary', () => {
    const route = service.resolveRoute('personal', adminStaff);
    expect(route.approverType).toBe('secretary');
  });

  it('routes sick leave to owner for everyone', () => {
    const route = service.resolveRoute('sick', marketingStaff);
    expect(route.approverType).toBe('owner');
  });

  it('routes marketing staff emergency to owner with big leader awareness', () => {
    const route = service.resolveRoute('emergency', marketingStaff);
    expect(route.approverType).toBe('owner');
    expect(route.notifyBigLeaderAwareness).toBe(true);
  });
});
