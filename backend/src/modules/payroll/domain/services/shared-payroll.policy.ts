// ============================================================================
// Shared payroll policy — admin/back-office staff salary split across companies
// ============================================================================

import { BusinessRoleCode } from '../../../permission/domain/entities/business-role.types';

export type PayrollAllocationMode = 'standard' | 'shared_across_companies';
export type AdminCommissionOfficeType = 'front_office' | 'back_office';

const SHARED_DEPARTMENTS = new Set([
  'Admin',
  'เลขา',
  'HR',
  'Finance',
  'Hr',
  'hr',
]);

const SHARED_POSITIONS = new Set([
  'แอดมิน',
  'เลขา',
  'Telesales',
  'เทเรเซล',
  'telesales',
]);

const SHARED_BUSINESS_ROLES = new Set<BusinessRoleCode>([
  'secretary',
  'admin',
  'admin_manager',
]);

const BACK_OFFICE_DEPARTMENTS = new Set(['เลขา', 'HR', 'Finance', 'Hr', 'hr']);
const BACK_OFFICE_POSITIONS = new Set(['เลขา']);
const BACK_OFFICE_ROLES = new Set<BusinessRoleCode>(['secretary']);

export function qualifiesForSharedPayroll(input: {
  department?: string | null;
  position?: string | null;
  businessRole?: string | null;
}): boolean {
  if (input.department === 'Marketing') {
    return input.businessRole === 'secretary';
  }
  if (input.businessRole && SHARED_BUSINESS_ROLES.has(input.businessRole as BusinessRoleCode)) {
    return true;
  }
  if (input.department && SHARED_DEPARTMENTS.has(input.department)) {
    return true;
  }
  if (input.position && SHARED_POSITIONS.has(input.position)) {
    return true;
  }
  const pos = (input.position ?? '').toLowerCase();
  if (pos.includes('telesale') || pos.includes('เทเรเซล')) {
    return true;
  }
  return false;
}

/** Admin commission pool B is front-office only; HR/Finance/secretary are back-office. */
export function resolveAdminCommissionOfficeType(input: {
  department?: string | null;
  position?: string | null;
  businessRole?: string | null;
}): AdminCommissionOfficeType {
  if (input.businessRole && BACK_OFFICE_ROLES.has(input.businessRole as BusinessRoleCode)) {
    return 'back_office';
  }
  if (input.department && BACK_OFFICE_DEPARTMENTS.has(input.department)) {
    return 'back_office';
  }
  if (input.position && BACK_OFFICE_POSITIONS.has(input.position)) {
    return 'back_office';
  }
  return 'front_office';
}

/** Split master amount across N companies with cent remainder on first rows. */
export function splitAmountAcrossCompanies(total: number, companyCount: number): number[] {
  if (companyCount <= 0) return [];
  if (companyCount === 1) return [roundMoney(total)];
  const totalCents = Math.round(total * 100);
  const baseCents = Math.floor(totalCents / companyCount);
  const remainder = totalCents - baseCents * companyCount;
  const amounts: number[] = [];
  for (let i = 0; i < companyCount; i += 1) {
    const extra = i < remainder ? 1 : 0;
    amounts.push((baseCents + extra) / 100);
  }
  return amounts;
}

export function allocateShareOfTotal(total: number, companyCount: number): number {
  if (companyCount <= 1) return roundMoney(total);
  return roundMoney(total / companyCount);
}

export function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}
