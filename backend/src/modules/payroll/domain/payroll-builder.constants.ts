// ============================================================================
// modules/payroll/domain/payroll-builder.constants.ts
// ============================================================================

export const PAYROLL_BUILDER_NOTE_PREFIX = 'payroll_builder';

/** Item types created/updated by the cycle payroll builder. */
export const BUILDER_MANAGED_ITEM_TYPES = [
  'salary',
  'meal_allowance',
  'cross_border',
  'late_deduction',
  'absence_deduction',
  'excess_off_deduction',
  'break_deduction',
  'consecutive_leave_deduction',
  'leave_bonus',
  'deposit',
] as const;

export type BuilderManagedItemType = typeof BUILDER_MANAGED_ITEM_TYPES[number];

export const COMMISSION_ITEM_TYPES = [
  'commission',
  'commission_adjustment',
  'referral',
] as const;

export const COMMISSION_SOURCE_REF_TYPES = [
  'marketing_commission',
  'admin_commission',
  'referral_commission',
  'recruitment_commission',
  'manual_commission',
  'commission_adjustment',
] as const;

export const MANUAL_ADJUSTMENT_ITEM_TYPES = ['bonus', 'manual_adjustment'] as const;

export function isBuilderGeneratedNote(note: string | null | undefined): boolean {
  return (note ?? '').startsWith(PAYROLL_BUILDER_NOTE_PREFIX);
}

export function builderNote(detail: string): string {
  return `${PAYROLL_BUILDER_NOTE_PREFIX} | ${detail}`;
}
