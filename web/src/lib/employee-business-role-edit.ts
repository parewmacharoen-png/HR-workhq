import type { MeResponse } from '../api/client';

export function isOwnerBusinessRoleViewer(user: MeResponse | null | undefined): boolean {
  const businessRole = user?.businessRole?.toLowerCase() ?? '';
  if (businessRole === 'owner') return true;
  return (user?.roles ?? []).some((r) => {
    const code = r.toLowerCase();
    return code === 'owner' || code === 'super_admin';
  });
}

export function isSecretaryBusinessRoleViewer(user: MeResponse | null | undefined): boolean {
  return user?.businessRole?.toLowerCase() === 'secretary';
}

export function canEditEmployeeBusinessRoleClient(
  user: MeResponse | null | undefined,
  can: (permission: string) => boolean,
  canAny: (...permissions: string[]) => boolean,
  targetRole: string | null | undefined,
): { canEditBusinessRole: boolean; canAssignOwnerRole: boolean } {
  const canAssignOwnerRole = isOwnerBusinessRoleViewer(user);
  const hasWrite = canAny('employee:write', 'permission:write');
  const isHrEditor = isOwnerBusinessRoleViewer(user) || isSecretaryBusinessRoleViewer(user);

  if (!hasWrite || !isHrEditor) {
    return { canEditBusinessRole: false, canAssignOwnerRole };
  }

  const targetIsOwner = (targetRole?.toLowerCase() ?? '') === 'owner';
  if (targetIsOwner && !canAssignOwnerRole) {
    return { canEditBusinessRole: false, canAssignOwnerRole };
  }

  return { canEditBusinessRole: true, canAssignOwnerRole };
}
