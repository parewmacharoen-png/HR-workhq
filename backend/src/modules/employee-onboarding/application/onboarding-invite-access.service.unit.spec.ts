import { OnboardingInviteAccessService } from './onboarding-invite-access.service';
import { ONBOARDING_INVITE_PERMISSIONS } from '../domain/onboarding-invite-permissions';
import { PermissionDeniedError } from '../../permission/domain/errors/permission.errors';

describe('OnboardingInviteAccessService', () => {
  const actor = { userId: 'user-1', impersonatorUserId: null, companyId: 'co-sb' };

  function build(overrides: {
    authorize?: jest.Mock;
    scopes?: Array<{ scopeType: string; companyId: string | null; teamId: string | null }>;
    invite?: Record<string, unknown> | null;
  } = {}) {
    const authorize = overrides.authorize ?? jest.fn().mockResolvedValue(undefined);
    const permissions = { authorize };
    const companyAccess = { assertCompanyAccess: jest.fn().mockResolvedValue(undefined) };
    const prisma = {
      employeeTelegramInvite: {
        findUnique: jest.fn().mockResolvedValue(overrides.invite ?? {
          id: 'inv-1',
          companyId: 'co-sb',
          employeeId: null,
          presetJson: { teamId: 'team-1' },
        }),
      },
      employeeAssignment: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const authCtx = {
      loadForUser: jest.fn().mockResolvedValue({
        scopes: overrides.scopes ?? [{ scopeType: 'all', companyId: null, teamId: null }],
      }),
    };
    const businessPermissions = {
      findUserAccess: jest.fn().mockResolvedValue({
        businessRole: 'owner',
        scopes: overrides.scopes ?? [{ scopeType: 'all', companyId: null, teamId: null }],
      }),
    };

    const svc = new OnboardingInviteAccessService(
      permissions as never,
      companyAccess as never,
      prisma as never,
      authCtx as never,
      businessPermissions as never,
    );

    return { svc, authorize, prisma, companyAccess };
  }

  it('assertCanCreateNewEmployee requires create and new-employee permissions', async () => {
    const { svc, authorize } = build();
    await svc.assertCanCreateNewEmployee(actor, 'co-sb', 'team-1');
    expect(authorize).toHaveBeenCalledWith('user-1', expect.objectContaining({
      permission: ONBOARDING_INVITE_PERMISSIONS.create,
      companyId: 'co-sb',
      teamId: 'team-1',
    }));
    expect(authorize).toHaveBeenCalledWith('user-1', expect.objectContaining({
      permission: ONBOARDING_INVITE_PERMISSIONS.newEmployee,
    }));
  });

  it('assertCanLinkExisting requires create and link-existing permissions', async () => {
    const { svc, authorize } = build();
    await svc.assertCanLinkExisting(actor, 'emp-1', 'co-sb');
    expect(authorize).toHaveBeenCalledWith('user-1', expect.objectContaining({
      permission: ONBOARDING_INVITE_PERMISSIONS.linkExisting,
      subjectEmployeeId: 'emp-1',
    }));
  });

  it('assertCanCancel requires cancel permission with invite scope', async () => {
    const { svc, authorize } = build();
    await svc.assertCanCancel(actor, 'inv-1');
    expect(authorize).toHaveBeenCalledWith('user-1', expect.objectContaining({
      permission: ONBOARDING_INVITE_PERMISSIONS.cancel,
      companyId: 'co-sb',
      teamId: 'team-1',
    }));
  });

  it('buildListScopeWhere filters by company scope', async () => {
    const { svc, companyAccess } = build({
      scopes: [{ scopeType: 'company', companyId: 'co-sb', teamId: null }],
    });
    const where = await svc.buildListScopeWhere(actor, 'co-sb');
    expect(where).toEqual({ companyId: 'co-sb' });
    expect(companyAccess.assertCompanyAccess).toHaveBeenCalledWith(actor, 'co-sb');
  });

  it('buildListScopeWhere rejects out-of-scope company filter', async () => {
    const { svc, authorize } = build({
      scopes: [{ scopeType: 'company', companyId: 'co-sb', teamId: null }],
      authorize: jest.fn().mockImplementation((_userId, req) => {
        if (req.companyId === 'co-other') {
          return Promise.reject(new PermissionDeniedError('out of scope'));
        }
        return Promise.resolve();
      }),
    });
    await expect(svc.buildListScopeWhere(actor, 'co-other')).rejects.toBeInstanceOf(PermissionDeniedError);
    expect(authorize).toHaveBeenCalled();
  });

  it('isAlreadyRejected path — assertCanRegenerate uses regenerate permission', async () => {
    const { svc, authorize } = build();
    await svc.assertCanRegenerate(actor, 'inv-1');
    expect(authorize).toHaveBeenCalledWith('user-1', expect.objectContaining({
      permission: ONBOARDING_INVITE_PERMISSIONS.regenerate,
    }));
  });
});
