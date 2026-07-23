export interface SharedPayrollOrgInput {
  department?: string | null;
  position?: string | null;
  businessRole?: string | null;
}

const SHARED_DEPARTMENTS = new Set(['Admin', 'เลขา', 'HR', 'Finance', 'Hr', 'hr']);
const SHARED_POSITIONS = new Set(['แอดมิน', 'เลขา', 'Telesales', 'เทเรเซล', 'telesales']);
const SHARED_ROLES = new Set(['secretary', 'admin', 'admin_manager']);

export function qualifiesForSharedPayroll(input: SharedPayrollOrgInput): boolean {
  if (input.department === 'Marketing') {
    return input.businessRole === 'secretary';
  }
  if (input.businessRole && SHARED_ROLES.has(input.businessRole)) return true;
  if (input.department && SHARED_DEPARTMENTS.has(input.department)) return true;
  if (input.position && SHARED_POSITIONS.has(input.position)) return true;
  const pos = (input.position ?? '').toLowerCase();
  return pos.includes('telesale') || pos.includes('เทเรเซล');
}

export function perCompanyShare(master: number, companyCount: number): number {
  if (companyCount < 1) return master;
  return Math.round((master / companyCount) * 100) / 100;
}
