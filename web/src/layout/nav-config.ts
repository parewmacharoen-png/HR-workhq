import {
  HR_HIDDEN_NAV_GROUP_IDS,
  HR_HIDDEN_SETTINGS_PATHS,
  isMarketingEnabled,
} from '../config/product';

export interface NavItem {
  label: string;
  path: string;
  icon?: string;
  permissions?: string[];
  /** Match child paths for active highlight */
  matchPrefix?: string;
  /** Hidden when marketing product surfaces are disabled (HR mode). */
  marketingOnly?: boolean;
  /** Shown in HR mode when marketing nav is hidden. */
  hrOnly?: boolean;
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

/**
 * UX-001 — Task-first sidebar (12 items).
 * Advanced / module configuration lives under Settings only.
 */
export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'main',
    label: 'เมนูหลัก',
    items: [
      { label: 'ภาพรวม', path: '/dashboard', icon: '🏠' },
      { label: 'งานของฉัน', path: '/my-work', icon: '📌', permissions: ['workflow:read'] },
      {
        label: 'คำขอ',
        path: '/requests',
        icon: '📋',
        matchPrefix: '/requests',
        permissions: ['workflow:read'],
      },
      {
        label: 'อนุมัติ',
        path: '/approvals',
        icon: '✅',
        matchPrefix: '/approvals',
        permissions: ['workflow:act'],
      },
      {
        label: 'พนักงาน',
        path: '/hr/employees',
        icon: '👥',
        matchPrefix: '/hr/employees',
        permissions: ['employee:read'],
      },
      {
        label: 'อุปกรณ์ยืม',
        path: '/hr/assets',
        icon: '💻',
        matchPrefix: '/hr/assets',
        permissions: ['employee:read'],
      },
      {
        label: 'เวลาเข้างาน',
        path: '/attendance',
        icon: '⏰',
        matchPrefix: '/attendance',
        permissions: ['attendance:read'],
      },
      {
        label: 'วันลา / วันหยุด',
        path: '/leave',
        icon: '🏖️',
        matchPrefix: '/leave',
        permissions: ['leave:read'],
      },
      {
        label: 'เงินเดือน',
        path: '/payroll/cycles',
        icon: '💰',
        matchPrefix: '/payroll',
        permissions: ['payroll:read'],
      },
      {
        label: 'คอมมิชชั่น',
        path: '/commission',
        icon: '💎',
        matchPrefix: '/commission',
        permissions: ['commission:read'],
        marketingOnly: true,
      },
      {
        label: 'ค่าคอมแอดมิน',
        path: '/commission/admin',
        icon: '💼',
        matchPrefix: '/commission/admin',
        permissions: ['payroll:read', 'commission:read'],
      },
      {
        label: 'ประเมินผล / KPI',
        path: '/performance',
        icon: '🎯',
        matchPrefix: '/performance',
        permissions: ['performance:read'],
      },
      {
        label: 'รายงาน',
        path: '/reports',
        icon: '📊',
        matchPrefix: '/reports',
        permissions: ['reporting:executive', 'reporting:owner', 'settings:read'],
      },
      {
        label: 'ตั้งค่า',
        path: '/settings',
        icon: '⚙️',
        matchPrefix: '/settings',
        permissions: ['settings:read'],
      },
    ],
  },
  // Marketing-only surfaces (hidden in HR product mode)
  {
    id: 'marketing',
    label: 'การตลาด',
    items: [
      { label: 'รายงานการตลาด', path: '/marketing/reports', icon: '📊', permissions: ['marketing:read'] },
      { label: 'ตรวจ KPI', path: '/marketing/kpi', icon: '🎯', permissions: ['marketing:read'] },
      { label: 'ค่าใช้จ่าย', path: '/marketing/expenses', icon: '💳', permissions: ['marketing:read'] },
    ],
  },
];

export function filterNavGroups(
  permissions: string[],
  marketingEnabled = isMarketingEnabled(),
  hasAllScope = false,
): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.marketingOnly && !marketingEnabled) return false;
        if (item.hrOnly && marketingEnabled) return false;
        if (!marketingEnabled) {
          if (HR_HIDDEN_NAV_GROUP_IDS.has(group.id)) return false;
          if (HR_HIDDEN_SETTINGS_PATHS.has(item.path)) return false;
        }
        if (!item.permissions?.length) return true;
        if (hasAllScope) return true;
        return item.permissions.some((p) => permissions.includes(p));
      }),
    }))
    .filter((group) => group.items.length > 0);
}
