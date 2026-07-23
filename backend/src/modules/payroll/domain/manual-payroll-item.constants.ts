// ============================================================================
// Manual payroll item categories — Thai labels and payroll item type mapping
// ============================================================================

import type { PayrollItemType } from '@prisma/client';

export const MANUAL_PAYROLL_ITEM_NOTE_PREFIX = 'manual_item';

export type ManualPayrollItemCategory =
  | 'bonus'
  | 'commission'
  | 'ot'
  | 'meal_allowance'
  | 'phone_allowance'
  | 'fuel_allowance'
  | 'diligence_bonus'
  | 'travel_allowance'
  | 'other_earning'
  | 'utility_deduction'
  | 'deposit_deduction'
  | 'advance_deduction'
  | 'penalty'
  | 'tax_deduction'
  | 'other_deduction';

export type ManualPayrollScheduleType = 'one_time' | 'recurring';

export interface ManualPayrollCategoryMeta {
  key: ManualPayrollItemCategory;
  labelTh: string;
  direction: 'earning' | 'deduction';
  itemType: PayrollItemType;
}

export const MANUAL_PAYROLL_EARNING_CATEGORIES: ManualPayrollCategoryMeta[] = [
  { key: 'bonus', labelTh: 'โบนัส', direction: 'earning', itemType: 'bonus' },
  { key: 'commission', labelTh: 'ค่าคอมมิชชั่น', direction: 'earning', itemType: 'commission' },
  { key: 'ot', labelTh: 'OT', direction: 'earning', itemType: 'ot' },
  { key: 'meal_allowance', labelTh: 'ค่าข้าว', direction: 'earning', itemType: 'meal_allowance' },
  { key: 'phone_allowance', labelTh: 'ค่าโทรศัพท์', direction: 'earning', itemType: 'manual_adjustment' },
  { key: 'fuel_allowance', labelTh: 'ค่าน้ำมัน', direction: 'earning', itemType: 'manual_adjustment' },
  { key: 'diligence_bonus', labelTh: 'เบี้ยขยัน', direction: 'earning', itemType: 'manual_adjustment' },
  { key: 'travel_allowance', labelTh: 'ค่าเดินทาง', direction: 'earning', itemType: 'manual_adjustment' },
  { key: 'other_earning', labelTh: 'ค่าอื่นๆ', direction: 'earning', itemType: 'manual_adjustment' },
];

export const MANUAL_PAYROLL_DEDUCTION_CATEGORIES: ManualPayrollCategoryMeta[] = [
  { key: 'utility_deduction', labelTh: 'หักค่าไฟ', direction: 'deduction', itemType: 'manual_adjustment' },
  { key: 'deposit_deduction', labelTh: 'หักประกัน', direction: 'deduction', itemType: 'deposit' },
  { key: 'advance_deduction', labelTh: 'เงินเบิก', direction: 'deduction', itemType: 'manual_adjustment' },
  { key: 'penalty', labelTh: 'ค่าปรับ', direction: 'deduction', itemType: 'manual_adjustment' },
  { key: 'tax_deduction', labelTh: 'หักภาษี', direction: 'deduction', itemType: 'manual_adjustment' },
  { key: 'other_deduction', labelTh: 'หักอื่นๆ', direction: 'deduction', itemType: 'manual_adjustment' },
];

export const ALL_MANUAL_PAYROLL_CATEGORIES: ManualPayrollCategoryMeta[] = [
  ...MANUAL_PAYROLL_EARNING_CATEGORIES,
  ...MANUAL_PAYROLL_DEDUCTION_CATEGORIES,
];

const CATEGORY_BY_KEY = new Map(
  ALL_MANUAL_PAYROLL_CATEGORIES.map((row) => [row.key, row]),
);

export function getManualPayrollCategoryMeta(
  category: ManualPayrollItemCategory,
): ManualPayrollCategoryMeta {
  const meta = CATEGORY_BY_KEY.get(category);
  if (!meta) throw new Error(`Unknown manual payroll category: ${category}`);
  return meta;
}

export function manualPayrollItemNote(
  definitionId: string,
  category: ManualPayrollItemCategory,
  userNote?: string | null,
): string {
  const meta = getManualPayrollCategoryMeta(category);
  const parts = [
    `${MANUAL_PAYROLL_ITEM_NOTE_PREFIX}:${definitionId}`,
    meta.labelTh,
    userNote?.trim(),
  ].filter(Boolean);
  return parts.join(' | ');
}

export function isManualPayrollItemNote(note: string | null | undefined): boolean {
  return (note ?? '').startsWith(`${MANUAL_PAYROLL_ITEM_NOTE_PREFIX}:`);
}

export function extractManualPayrollDefinitionId(note: string | null | undefined): string | null {
  if (!isManualPayrollItemNote(note)) return null;
  const segment = (note ?? '').split('|')[0]?.trim() ?? '';
  const id = segment.slice(`${MANUAL_PAYROLL_ITEM_NOTE_PREFIX}:`.length);
  return id || null;
}

export function signedAmountForCategory(
  category: ManualPayrollItemCategory,
  amount: number,
): number {
  const meta = getManualPayrollCategoryMeta(category);
  const abs = Math.abs(amount);
  return meta.direction === 'deduction' ? -abs : abs;
}

export function isDefinitionEffectiveForPeriod(
  effectiveFrom: Date,
  effectiveUntil: Date | null,
  periodStart: Date,
  periodEnd: Date,
): boolean {
  const from = startOfDay(effectiveFrom);
  const until = effectiveUntil ? startOfDay(effectiveUntil) : null;
  const start = startOfDay(periodStart);
  const end = startOfDay(periodEnd);
  if (from > end) return false;
  if (until != null && until < start) return false;
  return true;
}

function startOfDay(value: Date): Date {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
