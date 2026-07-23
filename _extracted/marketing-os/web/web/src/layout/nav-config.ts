export interface NavItem {
  label: string;
  path: string;
  permissions?: string[];
}

export interface NavGroup {
  id: string;
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    items: [{ label: 'Overview', path: '/dashboard' }],
  },
  {
    id: 'hr',
    label: 'HR',
    items: [
      { label: 'Employees', path: '/hr/employees', permissions: ['employee:read'] },
    ],
  },
  {
    id: 'attendance',
    label: 'Attendance',
    items: [
      { label: 'Daily Attendance', path: '/attendance/daily', permissions: ['attendance:read'] },
      { label: 'OT Approvals', path: '/attendance/overtime', permissions: ['attendance:read'] },
    ],
  },
  {
    id: 'leave',
    label: 'Leave',
    items: [
      { label: 'Requests', path: '/leave/requests', permissions: ['leave:read'] },
      { label: 'Reschedule', path: '/leave/reschedule', permissions: ['leave:read'] },
      { label: 'Shift Swaps', path: '/leave/shift-swaps', permissions: ['leave:read'] },
    ],
  },
  {
    id: 'payroll',
    label: 'Payroll',
    items: [
      { label: 'Cycles', path: '/payroll/cycles', permissions: ['payroll:read'] },
    ],
  },
  {
    id: 'marketing',
    label: 'Marketing',
    items: [
      { label: 'Reports', path: '/marketing/reports', permissions: ['marketing:read'] },
      { label: 'KPI Review', path: '/marketing/kpi', permissions: ['marketing:read'] },
      { label: 'Expenses', path: '/marketing/expenses', permissions: ['marketing:read'] },
      { label: 'Expense Dashboard', path: '/marketing/expenses/dashboard', permissions: ['marketing:read'] },
      { label: 'Teams', path: '/marketing/teams', permissions: ['marketing:read'] },
      { label: 'Insights', path: '/marketing/insights', permissions: ['marketing:read'] },
      { label: 'Audit History', path: '/marketing/audit', permissions: ['marketing:audit', 'marketing:read'] },
    ],
  },
  {
    id: 'commission',
    label: 'Commission',
    items: [
      { label: 'Cycles', path: '/commission/cycles', permissions: ['commission:read'] },
      { label: 'Adjustments', path: '/commission/adjustments', permissions: ['commission:read'] },
      { label: 'Declarations', path: '/commission/declarations', permissions: ['commission:read'] },
    ],
  },
  {
    id: 'finance',
    label: 'Finance',
    items: [
      { label: 'Finance Overview', path: '/finance', permissions: ['finance:read'] },
    ],
  },
  {
    id: 'knowledge',
    label: 'Knowledge Base',
    items: [
      { label: 'Articles', path: '/knowledge/articles', permissions: ['knowledge:read'] },
    ],
  },
  {
    id: 'settings',
    label: 'Settings',
    items: [
      { label: 'Marketing Commission', path: '/settings/commission/marketing', permissions: ['reporting:owner'] },
      { label: 'Admin Commission', path: '/settings/commission/admin', permissions: ['reporting:owner'] },
    ],
  },
  {
    id: 'executive',
    label: 'Executive',
    items: [
      { label: 'Executive Dashboard', path: '/executive', permissions: ['reporting:executive', 'reporting:owner'] },
    ],
  },
];

export function filterNavGroups(permissions: string[]): NavGroup[] {
  return NAV_GROUPS
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (!item.permissions?.length) return true;
        return item.permissions.some((p) => permissions.includes(p));
      }),
    }))
    .filter((group) => group.items.length > 0);
}
