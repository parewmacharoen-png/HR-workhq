import { describe, expect, it } from 'vitest';
import { ONBOARDING_INVITE_PERMISSIONS } from '../constants/onboarding-invite-permissions';

function resolvePermissions(can: (key: string) => boolean) {
  const canCreate = can(ONBOARDING_INVITE_PERMISSIONS.create);
  const canNewEmployee = can(ONBOARDING_INVITE_PERMISSIONS.newEmployee);
  const canLinkExisting = can(ONBOARDING_INVITE_PERMISSIONS.linkExisting);
  return {
    canShowPage: can(ONBOARDING_INVITE_PERMISSIONS.view),
    showNewMode: canCreate && canNewEmployee,
    showExistingMode: canCreate && canLinkExisting,
    canShowInviteButton: (canCreate && canNewEmployee) || (canCreate && canLinkExisting),
    canLinkOnEmployeeDetail: canCreate && canLinkExisting,
    canRegenerate: can(ONBOARDING_INVITE_PERMISSIONS.regenerate),
    canCancel: can(ONBOARDING_INVITE_PERMISSIONS.cancel),
  };
}

describe('onboarding invite permission UX', () => {
  it('shows both modes when user has both create permissions', () => {
    const perms = new Set<string>([
      ONBOARDING_INVITE_PERMISSIONS.view,
      ONBOARDING_INVITE_PERMISSIONS.create,
      ONBOARDING_INVITE_PERMISSIONS.newEmployee,
      ONBOARDING_INVITE_PERMISSIONS.linkExisting,
    ]);
    const r = resolvePermissions((k) => perms.has(k));
    expect(r.showNewMode).toBe(true);
    expect(r.showExistingMode).toBe(true);
    expect(r.canShowInviteButton).toBe(true);
  });

  it('shows only new employee mode when only new-employee granted', () => {
    const perms = new Set<string>([
      ONBOARDING_INVITE_PERMISSIONS.view,
      ONBOARDING_INVITE_PERMISSIONS.create,
      ONBOARDING_INVITE_PERMISSIONS.newEmployee,
    ]);
    const r = resolvePermissions((k) => perms.has(k));
    expect(r.showNewMode).toBe(true);
    expect(r.showExistingMode).toBe(false);
  });

  it('shows only existing employee mode when only link-existing granted', () => {
    const perms = new Set<string>([
      ONBOARDING_INVITE_PERMISSIONS.view,
      ONBOARDING_INVITE_PERMISSIONS.create,
      ONBOARDING_INVITE_PERMISSIONS.linkExisting,
    ]);
    const r = resolvePermissions((k) => perms.has(k));
    expect(r.showNewMode).toBe(false);
    expect(r.showExistingMode).toBe(true);
  });

  it('denies page when no view permission', () => {
    const r = resolvePermissions(() => false);
    expect(r.canShowPage).toBe(false);
    expect(r.canShowInviteButton).toBe(false);
  });

  it('hides employee detail link without link-existing', () => {
    const perms = new Set<string>([
      ONBOARDING_INVITE_PERMISSIONS.create,
      ONBOARDING_INVITE_PERMISSIONS.newEmployee,
    ]);
    const r = resolvePermissions((k) => perms.has(k));
    expect(r.canLinkOnEmployeeDetail).toBe(false);
  });

  it('regenerate/cancel follow dedicated permissions', () => {
    const perms = new Set<string>([
      ONBOARDING_INVITE_PERMISSIONS.regenerate,
    ]);
    const r = resolvePermissions((k) => perms.has(k));
    expect(r.canRegenerate).toBe(true);
    expect(r.canCancel).toBe(false);
  });
});
