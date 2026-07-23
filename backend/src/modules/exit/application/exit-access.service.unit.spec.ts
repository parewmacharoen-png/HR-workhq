import { ExitAccessService } from './exit-access.service';
import { ForbiddenError } from '../../../shared/kernel/domain-error';

describe('ExitAccessService', () => {
  const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
  const employeeAccess = { assertEmployeeInCompany: jest.fn().mockResolvedValue(undefined) };
  const permissions = {
    findUserAccess: jest.fn(),
  };

  let service: ExitAccessService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ExitAccessService(
      companyAccess as never,
      employeeAccess as never,
      permissions as never,
    );
  });

  it('allows owner to cancel', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'owner' });
    await expect(service.assertCanCancel({ userId: 'u1' } as never, 'co-1')).resolves.toBeUndefined();
  });

  it('allows secretary to cancel', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'secretary' });
    await expect(service.assertCanCancel({ userId: 'u1' } as never, 'co-1')).resolves.toBeUndefined();
  });

  it('denies big leader cancel', async () => {
    permissions.findUserAccess.mockResolvedValue({ businessRole: 'big_leader' });
    await expect(service.assertCanCancel({ userId: 'u1' } as never, 'co-1'))
      .rejects.toBeInstanceOf(ForbiddenError);
  });
});
