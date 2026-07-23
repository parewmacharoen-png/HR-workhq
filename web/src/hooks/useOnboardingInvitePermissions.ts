import { useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { ONBOARDING_INVITE_PERMISSIONS } from '../constants/onboarding-invite-permissions';

export function useOnboardingInvitePermissions() {
  const { can, user, isPlatformOperator } = useAuth();

  return useMemo(() => {
    const hasAllScope = Boolean(user?.scopes?.some((s) => s.scopeType === 'all'));
    const isElevated = Boolean(
      isPlatformOperator
      || hasAllScope
      || user?.roles?.some((r) => ['super_admin', 'owner', 'secretary'].includes(r))
      || can('employee:write')
      || can('scope:all')
    );

    const canView = can(ONBOARDING_INVITE_PERMISSIONS.view) || isElevated;
    const canCreate = can(ONBOARDING_INVITE_PERMISSIONS.create) || isElevated;
    const canNewEmployee = can(ONBOARDING_INVITE_PERMISSIONS.newEmployee) || isElevated;
    const canLinkExisting = can(ONBOARDING_INVITE_PERMISSIONS.linkExisting) || isElevated;
    const canManage = can(ONBOARDING_INVITE_PERMISSIONS.manage) || isElevated;
    const canRegenerate = can(ONBOARDING_INVITE_PERMISSIONS.regenerate) || isElevated;
    const canCancel = can(ONBOARDING_INVITE_PERMISSIONS.cancel) || isElevated;

    const showNewMode = canCreate && canNewEmployee;
    const showExistingMode = canCreate && canLinkExisting;
    const canShowInviteButton = showNewMode || showExistingMode;

    return {
      canView,
      canCreate,
      canNewEmployee,
      canLinkExisting,
      canManage,
      canRegenerate,
      canCancel,
      showNewMode,
      showExistingMode,
      canShowInviteButton,
      canShowPage: canView,
      canLinkOnEmployeeDetail: canCreate && canLinkExisting,
    };
  }, [can, user, isPlatformOperator]);
}
