// ============================================================================
// P0-001c — Configurable onboarding invitation permission keys
// ============================================================================

export const ONBOARDING_INVITE_PERMISSION_CATEGORY = 'Employee Onboarding';

export const ONBOARDING_INVITE_PERMISSIONS = {
  view: 'employee:onboarding:invite:view',
  create: 'employee:onboarding:invite:create',
  manage: 'employee:onboarding:invite:manage',
  cancel: 'employee:onboarding:invite:cancel',
  regenerate: 'employee:onboarding:invite:regenerate',
  linkExisting: 'employee:onboarding:invite:link-existing',
  newEmployee: 'employee:onboarding:invite:new-employee',
} as const;

export type OnboardingInvitePermissionKey =
  (typeof ONBOARDING_INVITE_PERMISSIONS)[keyof typeof ONBOARDING_INVITE_PERMISSIONS];

export const ALL_ONBOARDING_INVITE_PERMISSIONS: OnboardingInvitePermissionKey[] = [
  ONBOARDING_INVITE_PERMISSIONS.view,
  ONBOARDING_INVITE_PERMISSIONS.create,
  ONBOARDING_INVITE_PERMISSIONS.manage,
  ONBOARDING_INVITE_PERMISSIONS.cancel,
  ONBOARDING_INVITE_PERMISSIONS.regenerate,
  ONBOARDING_INVITE_PERMISSIONS.linkExisting,
  ONBOARDING_INVITE_PERMISSIONS.newEmployee,
];

/** Big Leader default — cancel excluded */
export const BIG_LEADER_ONBOARDING_INVITE_PERMISSIONS: OnboardingInvitePermissionKey[] = [
  ONBOARDING_INVITE_PERMISSIONS.view,
  ONBOARDING_INVITE_PERMISSIONS.create,
  ONBOARDING_INVITE_PERMISSIONS.manage,
  ONBOARDING_INVITE_PERMISSIONS.regenerate,
  ONBOARDING_INVITE_PERMISSIONS.linkExisting,
  ONBOARDING_INVITE_PERMISSIONS.newEmployee,
];

export const ONBOARDING_INVITE_PERMISSION_LABELS_TH: Record<OnboardingInvitePermissionKey, string> = {
  [ONBOARDING_INVITE_PERMISSIONS.view]: 'ดูลิงก์เชิญพนักงาน',
  [ONBOARDING_INVITE_PERMISSIONS.create]: 'สร้างลิงก์เชิญพนักงาน',
  [ONBOARDING_INVITE_PERMISSIONS.manage]: 'จัดการลิงก์เชิญพนักงาน',
  [ONBOARDING_INVITE_PERMISSIONS.cancel]: 'ยกเลิกลิงก์เชิญ',
  [ONBOARDING_INVITE_PERMISSIONS.regenerate]: 'สร้างลิงก์ใหม่',
  [ONBOARDING_INVITE_PERMISSIONS.linkExisting]: 'เชื่อม Telegram ให้พนักงานเดิม',
  [ONBOARDING_INVITE_PERMISSIONS.newEmployee]: 'เชิญพนักงานใหม่',
};
