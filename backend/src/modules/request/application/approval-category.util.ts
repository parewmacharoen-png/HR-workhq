// Shared approval category resolution for backend hub + request list.
export type ApprovalCategoryKey = 'all' | 'leave' | 'ot' | 'monthly_off' | 'attendance' | 'other';

const LEAVE_KEYS = new Set([
  'leave', 'leave_reschedule', 'leave_shift_swap', 'leave_request',
]);
const OT_KEYS = new Set(['overtime', 'ot_request']);
const MONTHLY_OFF_KEYS = new Set(['monthly_off']);
const ATTENDANCE_KEYS = new Set([
  'attendance_correction', 'time_correction', 'no_break_report',
]);
const PAYROLL_KEYS = new Set(['salary_review', 'promotion_review', 'advance', 'payroll_adjustment']);

export function resolveApprovalCategory(
  requestTypeKey?: string | null,
  entityType?: string | null,
): ApprovalCategoryKey {
  const key = requestTypeKey ?? entityType ?? '';
  if (LEAVE_KEYS.has(key)) return 'leave';
  if (OT_KEYS.has(key)) return 'ot';
  if (MONTHLY_OFF_KEYS.has(key)) return 'monthly_off';
  if (ATTENDANCE_KEYS.has(key)) return 'attendance';
  if (PAYROLL_KEYS.has(key)) return 'other';
  if (entityType && LEAVE_KEYS.has(entityType)) return 'leave';
  if (entityType && OT_KEYS.has(entityType)) return 'ot';
  if (entityType && MONTHLY_OFF_KEYS.has(entityType)) return 'monthly_off';
  if (entityType && ATTENDANCE_KEYS.has(entityType)) return 'attendance';
  if (entityType && PAYROLL_KEYS.has(entityType)) return 'other';
  return 'other';
}
