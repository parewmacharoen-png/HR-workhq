export const EMPLOYEE_DETAIL_TABS = [
  { id: 'overview', label: 'ภาพรวม' },
  { id: 'personal', label: 'ข้อมูลส่วนตัว' },
  { id: 'employment', label: 'การจ้างงาน' },
  { id: 'payroll', label: 'เงินเดือน' },
  { id: 'attendance', label: 'เวลาทำงาน' },
  { id: 'leave', label: 'การลา' },
  { id: 'assets', label: 'อุปกรณ์ยืม' },
  { id: 'performance', label: 'ผลการทำงาน' },
  { id: 'commission', label: 'ค่าคอมมิชชั่น' },
  { id: 'documents', label: 'เอกสาร' },
  { id: 'timeline', label: 'ไทม์ไลน์' },
  { id: 'permission', label: 'สิทธิ์การเข้าถึง' },
] as const;

export type EmployeeDetailTabId = typeof EMPLOYEE_DETAIL_TABS[number]['id'];

export const DEFAULT_EMPLOYEE_TAB: EmployeeDetailTabId = 'overview';

export function parseEmployeeTab(value: string | null): EmployeeDetailTabId {
  const normalized = value === 'salary'
    ? 'payroll'
    : value === 'kpi'
      ? 'performance'
      : value;
  const found = EMPLOYEE_DETAIL_TABS.find((t) => t.id === normalized);
  return found?.id ?? DEFAULT_EMPLOYEE_TAB;
}
