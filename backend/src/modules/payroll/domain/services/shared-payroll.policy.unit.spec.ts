import {
  allocateShareOfTotal,
  qualifiesForSharedPayroll,
  resolveAdminCommissionOfficeType,
  splitAmountAcrossCompanies,
} from './shared-payroll.policy';

describe('shared-payroll.policy', () => {
  it('qualifies admin department and secretary role', () => {
    expect(qualifiesForSharedPayroll({ department: 'Admin' })).toBe(true);
    expect(qualifiesForSharedPayroll({ businessRole: 'secretary' })).toBe(true);
    expect(qualifiesForSharedPayroll({ position: 'แอดมิน' })).toBe(true);
    expect(qualifiesForSharedPayroll({ position: 'Telesales' })).toBe(true);
  });

  it('does not qualify marketing employee by default', () => {
    expect(qualifiesForSharedPayroll({ department: 'Marketing', position: 'พนักงาน' })).toBe(false);
  });

  it('splits 55000 across 5 companies evenly', () => {
    expect(splitAmountAcrossCompanies(55_000, 5)).toEqual([11_000, 11_000, 11_000, 11_000, 11_000]);
  });

  it('distributes remainder cents on first companies', () => {
    const parts = splitAmountAcrossCompanies(100, 3);
    expect(parts.reduce((a, b) => a + b, 0)).toBeCloseTo(100, 2);
    expect(parts.length).toBe(3);
  });

  it('allocates share of total', () => {
    expect(allocateShareOfTotal(6000, 5)).toBe(1200);
  });

  it('resolves admin commission office type', () => {
    expect(resolveAdminCommissionOfficeType({ department: 'Admin' })).toBe('front_office');
    expect(resolveAdminCommissionOfficeType({ department: 'HR' })).toBe('back_office');
    expect(resolveAdminCommissionOfficeType({ businessRole: 'secretary' })).toBe('back_office');
    expect(resolveAdminCommissionOfficeType({ position: 'Telesales' })).toBe('front_office');
  });
});
