import { KpiAccessService } from './kpi-access.service';
import { KpiForbiddenError } from '../domain/errors/kpi.errors';

describe('KpiAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const hierarchy = { getDescendantEmployeeIds: jest.fn().mockResolvedValue(['emp-2']) };
  const permissions = { findUserAccess: jest.fn() };

  let service: KpiAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new KpiAccessService(
      companyAccess as never,
      hierarchy as never,
      permissions as never,
    );
  });

  it('allows owner to finalize', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await expect(service.assertCanFinalize({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('allows secretary to manage templates', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertCanManageTemplates({ userId: 'u1' } as never, 'co-1'))
      .resolves.toBeUndefined();
  });

  it('denies big leader template management', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await expect(service.assertCanManageTemplates({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(KpiForbiddenError);
  });

  it('allows big leader to score within company', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader', employeeId: 'bl-1' });
    await expect(service.assertCanScore({ userId: 'u1' } as never, {
      employeeId: 'emp-9',
      reviewerId: null,
      companyId: 'co-1',
    })).resolves.toBeUndefined();
  });

  it('allows sub leader to review team member', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'sub_leader', employeeId: 'sub-1' });
    await expect(service.assertCanReview({ userId: 'u1' } as never, {
      employeeId: 'emp-2',
      reviewerId: null,
      companyId: 'co-1',
    })).resolves.toBeUndefined();
    expect(hierarchy.getDescendantEmployeeIds).toHaveBeenCalledWith('sub-1');
  });

  it('denies sub leader for outside team', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'sub_leader', employeeId: 'sub-1' });
    await expect(service.assertCanReview({ userId: 'u1' } as never, {
      employeeId: 'emp-99',
      reviewerId: null,
      companyId: 'co-1',
    })).rejects.toBeInstanceOf(KpiForbiddenError);
  });

  it('allows employee to view own KPI', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanViewEmployeeKpi({ userId: 'u1' } as never, 'emp-1', 'co-1'))
      .resolves.toBeUndefined();
    expect(companyAccess.assertCompanyAccess).not.toHaveBeenCalled();
  });

  it('denies employee viewing another employee KPI', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanViewEmployeeKpi({ userId: 'u1' } as never, 'emp-2', 'co-1'))
      .rejects.toBeInstanceOf(KpiForbiddenError);
  });
});
