export type ApprovalCategory = 'all' | 'leave' | 'ot' | 'attendance' | 'payroll' | 'hr' | 'other';

export const APPROVAL_CATEGORIES: Array<{ id: ApprovalCategory; label: string; icon: string }> = [
  { id: 'all', label: 'ทั้งหมด', icon: '📋' },
  { id: 'leave', label: 'ลา / วันหยุด', icon: '📅' },
  { id: 'ot', label: 'OT / เบรก', icon: '⏰' },
  { id: 'attendance', label: 'เวลางาน', icon: '🕒' },
  { id: 'payroll', label: 'เงินเดือน', icon: '💸' },
  { id: 'hr', label: 'HR', icon: '👤' },
];

const REQUEST_TYPE_ICONS: Record<string, string> = {
  leave_request: '📅',
  ot_request: '⏰',
  no_break_report: '☕',
  advance_pay: '💸',
  time_correction: '🕒',
  shift_change: '🔁',
  off_day_change: '🗓',
  document_request: '📄',
  employee_onboarding: '👤',
  telegram_registration_review: '👤',
  generic_request: '📝',
};

const WORKFLOW_ENTITY_ICONS: Record<string, string> = {
  monthly_off: '🗓',
  leave: '📅',
  leave_reschedule: '📅',
  overtime: '⏰',
  attendance_correction: '🕒',
  absence_record: '🚨',
  advance: '💸',
  salary_review: '💸',
  promotion_review: '👤',
};

export function requestTypeIcon(typeKey?: string | null, entityType?: string | null): string {
  if (typeKey && REQUEST_TYPE_ICONS[typeKey]) return REQUEST_TYPE_ICONS[typeKey];
  if (entityType && WORKFLOW_ENTITY_ICONS[entityType]) return WORKFLOW_ENTITY_ICONS[entityType];
  return '📝';
}

export function resolveApprovalCategory(
  typeKey?: string | null,
  entityType?: string | null,
): ApprovalCategory {
  const entity = entityType ?? '';
  if (['monthly_off', 'leave', 'leave_reschedule', 'leave_shift_swap'].includes(entity)) return 'leave';
  if (entity === 'overtime') return 'ot';
  if (['attendance_correction', 'absence_record', 'document_request'].includes(entity)) return 'attendance';
  if (['advance', 'payroll_adjustment', 'commission_adjustment', 'salary_review', 'promotion_review'].includes(entity)) return 'payroll';

  switch (typeKey) {
    case 'leave_request':
    case 'off_day_change':
      return 'leave';
    case 'ot_request':
    case 'no_break_report':
      return 'ot';
    case 'time_correction':
    case 'shift_change':
      return 'attendance';
    case 'advance_pay':
      return 'payroll';
    case 'employee_onboarding':
    case 'telegram_registration_review':
    case 'document_request':
      return 'hr';
    default:
      return 'other';
  }
}

export function matchesApprovalCategory(
  category: ApprovalCategory,
  typeKey?: string | null,
  entityType?: string | null,
): boolean {
  if (category === 'all') return true;
  return resolveApprovalCategory(typeKey, entityType) === category;
}

export const REQUEST_CATEGORY_OPTIONS = [
  { value: '', label: 'ทุกประเภท' },
  { value: 'leave', label: '📅 ลา' },
  { value: 'attendance', label: '⏰ เวลางาน / OT' },
  { value: 'payroll', label: '💸 เงินเดือน' },
  { value: 'shift', label: '🔁 กะ / ตาราง' },
  { value: 'document', label: '📄 เอกสาร' },
  { value: 'general', label: '📝 ทั่วไป' },
];

export function categoryLabel(category?: string | null): string {
  const hit = REQUEST_CATEGORY_OPTIONS.find((o) => o.value === category);
  return hit?.label ?? 'ทั่วไป';
}
