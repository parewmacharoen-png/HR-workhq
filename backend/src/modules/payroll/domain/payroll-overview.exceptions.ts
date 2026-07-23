// ============================================================================
// modules/payroll/domain/payroll-overview.exceptions.ts
// PAY-007 — shared payroll overview exception rules (also used before export).
// ============================================================================

import {
  BUILDER_MANAGED_ITEM_TYPES,
  COMMISSION_ITEM_TYPES,
  isBuilderGeneratedNote,
  MANUAL_ADJUSTMENT_ITEM_TYPES,
} from './payroll-builder.constants';

export type PayrollOverviewExceptionReason =
  | 'missing_bank_account'
  | 'missing_bank_account_name'
  | 'net_pay_non_positive'
  | 'pending_adjustment'
  | 'payroll_item_not_approved'
  | 'inactive_without_exit_settlement';

export interface PayrollOverviewBankSnapshot {
  accountNo: string | null;
  accountName: string | null;
}

export interface PayrollOverviewItemSnapshot {
  itemType: string;
  note: string | null;
  sourceRefType: string | null;
}

export interface PayrollOverviewExceptionInput {
  items: PayrollOverviewItemSnapshot[];
  netPayAmount: number;
  bank: PayrollOverviewBankSnapshot | null;
  employmentStatus: string;
  hasPaidFinalSettlement: boolean;
}

const APPROVAL_REQUIRED_TYPES = [
  'ot',
  'bonus',
  'manual_adjustment',
  'commission',
  'commission_adjustment',
  'referral',
  'cross_border',
] as const;

export function collectPayrollOverviewExceptions(
  input: PayrollOverviewExceptionInput,
): PayrollOverviewExceptionReason[] {
  const flags: PayrollOverviewExceptionReason[] = [];
  const bank = input.bank;

  if (!bank?.accountNo?.trim()) {
    flags.push('missing_bank_account');
  } else if (!bank.accountName?.trim()) {
    flags.push('missing_bank_account_name');
  }

  if (input.netPayAmount <= 0) {
    flags.push('net_pay_non_positive');
  }

  if (input.items.some(isPendingManualAdjustment)) {
    flags.push('pending_adjustment');
  }

  if (input.items.some(isUnapprovedPayrollItem)) {
    flags.push('payroll_item_not_approved');
  }

  if (
    (input.employmentStatus === 'terminated' || input.employmentStatus === 'suspended')
    && !input.hasPaidFinalSettlement
  ) {
    flags.push('inactive_without_exit_settlement');
  }

  return flags;
}

function isPendingManualAdjustment(item: PayrollOverviewItemSnapshot): boolean {
  if (!MANUAL_ADJUSTMENT_ITEM_TYPES.includes(item.itemType as typeof MANUAL_ADJUSTMENT_ITEM_TYPES[number])) {
    return false;
  }
  return !isApprovedItem(item);
}

function isUnapprovedPayrollItem(item: PayrollOverviewItemSnapshot): boolean {
  if (MANUAL_ADJUSTMENT_ITEM_TYPES.includes(item.itemType as typeof MANUAL_ADJUSTMENT_ITEM_TYPES[number])) {
    return false;
  }
  if (!APPROVAL_REQUIRED_TYPES.includes(item.itemType as typeof APPROVAL_REQUIRED_TYPES[number])) {
    return false;
  }
  if (COMMISSION_ITEM_TYPES.includes(item.itemType as typeof COMMISSION_ITEM_TYPES[number])
    && item.sourceRefType
    && item.sourceRefType !== 'manual') {
    return false;
  }
  return !isApprovedItem(item);
}

function isApprovedItem(item: PayrollOverviewItemSnapshot): boolean {
  if (isBuilderGeneratedNote(item.note)) return true;
  if (BUILDER_MANAGED_ITEM_TYPES.includes(item.itemType as typeof BUILDER_MANAGED_ITEM_TYPES[number])) {
    return true;
  }
  return (item.note ?? '').includes('workflow:approved');
}

export function maskBankAccountNo(accountNo: string | null | undefined): string | null {
  if (!accountNo?.trim()) return null;
  const normalized = accountNo.replace(/\s/g, '');
  if (normalized.length <= 4) return '****';
  return `****${normalized.slice(-4)}`;
}

export function derivePayrollStatus(
  hasItems: boolean,
  netPayAmount: number,
  hasException: boolean,
): 'ready' | 'exception' | 'no_items' | 'zero_net' | 'pending_approval' {
  if (!hasItems) return 'no_items';
  if (netPayAmount <= 0) return 'zero_net';
  if (hasException) return 'exception';
  return 'ready';
}
