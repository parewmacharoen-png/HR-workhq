// ============================================================================
// Fixed business role permission bundles (seeded to Role.role_permissions).
// ============================================================================

import {
  ALL_ONBOARDING_INVITE_PERMISSIONS,
  BIG_LEADER_ONBOARDING_INVITE_PERMISSIONS,
} from '../../../employee-onboarding/domain/onboarding-invite-permissions';
import {
  BusinessRoleCode,
  BusinessRoleTemplate,
  BUSINESS_ROLE_CODES,
} from './business-role.types';

const READ_DOMAINS = [
  'employee',
  'attendance',
  'leave',
  'payroll',
  'commission',
  'performance',
  'recruitment',
  'referral',
  'reporting',
  'workflow',
  'organization',
  'asset',
  'settings',
  'document',
  'warning',
  'knowledge',
  'security',
] as const;

function allHrPermissions(): string[] {
  const keys = new Set<string>();
  for (const domain of READ_DOMAINS) {
    keys.add(`${domain}:read`);
    keys.add(`${domain}:write`);
  }
  keys.add('salary:read');
  keys.add('finance:read');
  keys.add('finance:write');
  keys.add('finance:approve');
  keys.add('performance:score');
  keys.add('performance:configure');
  keys.add('performance:finalize');
  keys.add('referral:qualify');
  keys.add('referral:pay');
  keys.add('reporting:owner');
  keys.add('reporting:executive');
  keys.add('workflow:act');
  keys.add('role:assign');
  keys.add('scope:grant');
  keys.add('impersonation:use');
  keys.add('ai:chat');
  keys.add('permission:read');
  keys.add('permission:write');
  keys.add('employee:sensitive:read');
  for (const key of ALL_ONBOARDING_INVITE_PERMISSIONS) keys.add(key);
  return [...keys].sort();
}

export const BUSINESS_ROLE_BUNDLES: Record<BusinessRoleCode, string[]> = {
  owner: allHrPermissions(),
  secretary: [
    'employee:read',
    'employee:write',
    'attendance:read',
    'attendance:write',
    'leave:read',
    'leave:write',
    'payroll:read',
    'payroll:write',
    'salary:read',
    'referral:read',
    'document:read',
    'warning:read',
    'asset:read',
    'asset:write',
    'settings:read',
    'performance:read',
    'performance:write',
    'performance:finalize',
    'workflow:read',
    'workflow:write',
    'workflow:act',
    'recruitment:read',
    'reporting:read',
    'organization:read',
    'permission:read',
    'employee:sensitive:read',
    ...ALL_ONBOARDING_INVITE_PERMISSIONS,
  ],
  big_leader: [
    'employee:read',
    'employee:write',
    'attendance:read',
    'attendance:write',
    'leave:read',
    'leave:write',
    'workflow:act',
    'payroll:read',
    'salary:read',
    'performance:read',
    'referral:read',
    'warning:read',
    'asset:read',
    'asset:write',
    ...BIG_LEADER_ONBOARDING_INVITE_PERMISSIONS,
  ],
  sub_leader: [
    'employee:read',
    'attendance:read',
    'leave:read',
    'leave:write',
    'workflow:act',
    'performance:read',
    'payroll:read',
    'asset:read',
  ],
  admin_manager: [
    'employee:read',
    'employee:write',
    'attendance:read',
    'attendance:write',
    'leave:read',
    'leave:write',
    'referral:read',
    'referral:write',
    'document:read',
    'document:write',
    'warning:read',
    'warning:write',
    'asset:read',
    'asset:write',
    'payroll:read',
  ],
  admin: [
    'employee:read',
    'attendance:read',
    'attendance:write',
    'leave:read',
    'referral:read',
    'document:read',
    'payroll:read',
  ],
  employee: [
    'employee:read',
    'attendance:read',
    'leave:read',
    'leave:write',
    'payroll:read',
    'referral:read',
    'referral:write',
    'ai:chat',
  ],
};

const DEFAULT_SCOPE: Record<BusinessRoleCode, BusinessRoleTemplate['defaultScopeType']> = {
  owner: 'all',
  secretary: 'all',
  big_leader: 'company',
  sub_leader: 'team',
  admin_manager: 'company',
  admin: 'company',
  employee: 'self',
};

const ROLE_DESCRIPTIONS: Record<BusinessRoleCode, string> = {
  owner: 'Full HR access across all companies.',
  secretary: 'Secretary / HR Manager / payroll operator — broad read all companies; limited safe writes.',
  big_leader: 'Company-scoped leadership; all employee salaries within scoped companies.',
  sub_leader: 'Team-scoped leadership; own salary only.',
  admin_manager: 'Company HR operations; own salary only unless UserPermissionOverride.',
  admin: 'Company admin read/write; own salary only unless UserPermissionOverride.',
  employee: 'Self-service only; own salary only.',
};

function formatRoleName(code: BusinessRoleCode): string {
  if (code === 'secretary') return 'Secretary (HR / Payroll)';
  return code
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

export const BUSINESS_ROLE_TEMPLATES: BusinessRoleTemplate[] = BUSINESS_ROLE_CODES.map((code) => ({
  code,
  name: formatRoleName(code),
  description: ROLE_DESCRIPTIONS[code],
  defaultScopeType: DEFAULT_SCOPE[code],
  permissions: BUSINESS_ROLE_BUNDLES[code],
}));
