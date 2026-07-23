import { FinalSettlementAccessService } from './final-settlement-access.service';
import { FinalSettlementForbiddenError } from '../domain/errors/final-settlement.errors';

describe('FinalSettlementAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const permissions = { findUserAccess: jest.fn() };

  let service: FinalSettlementAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new FinalSettlementAccessService(companyAccess as never, permissions as never);
  });

  it('allows employee to read own paid settlement', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanRead(
      { userId: 'u1' } as never,
      'emp-1',
      'co-1',
      'paid',
    )).resolves.toBeUndefined();
  });

  it('denies employee reading non-paid settlement', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertCanRead(
      { userId: 'u1' } as never,
      'emp-1',
      'co-1',
      'draft',
    )).rejects.toBeInstanceOf(FinalSettlementForbiddenError);
  });

  it('allows owner to approve', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await expect(service.assertCanApprove({ userId: 'u1' } as never, 'co-1')).resolves.toBeUndefined();
  });

  it('denies secretary approve', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertCanApprove({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(FinalSettlementForbiddenError);
  });

  it('allows secretary to mark paid', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertCanMarkPaid({ userId: 'u1' } as never, 'co-1')).resolves.toBeUndefined();
  });

  it('allows big leader to read company settlement', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await expect(service.assertCanRead(
      { userId: 'u1' } as never,
      'emp-2',
      'co-1',
      'approved',
    )).resolves.toBeUndefined();
  });

  it('allows employee paid summary for own employee id', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertEmployeePaidSummary({ userId: 'u1' } as never, 'emp-1')).resolves.toBeUndefined();
  });

  it('denies employee paid summary for other employees', async () => {
    permissions.findUserAccess.mockResolvedValue({ employeeId: 'emp-1', businessRole: 'employee' });
    await expect(service.assertEmployeePaidSummary({ userId: 'u1' } as never, 'emp-2'))
      .rejects.toBeInstanceOf(FinalSettlementForbiddenError);
  });
});
