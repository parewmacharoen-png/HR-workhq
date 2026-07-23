// ============================================================================
// Unit tests — salary visibility policy (HR-12 FINAL matrix).
// ============================================================================

import { SalaryVisibilityPolicy } from './salary-visibility.policy';
import { BusinessRoleCode } from '../entities/business-role.types';

describe('SalaryVisibilityPolicy', () => {
  const policy = new SalaryVisibilityPolicy();
  const viewerUserId = 'viewer-user-id';
  const targetEmployeeId = 'target-employee-id';
  const otherEmployeeId = 'other-employee-id';
  const companyA = 'company-a';
  const companyB = 'company-b';

  function ctx(role: BusinessRoleCode | null, overrides: Array<{ permission: string; effect: 'allow' | 'deny' }> = []) {
    return {
      viewerUserId,
      viewerEmployeeId: otherEmployeeId,
      businessRole: role,
      scopes: [{ scopeType: 'company' as const, companyId: companyA, teamId: null }],
      overrides,
    };
  }

  it('owner can view any salary', () => {
    const result = policy.decide(ctx('owner'), targetEmployeeId, [companyB]);
    expect(result.canView).toBe(true);
  });

  it('secretary (HR Manager / payroll operator) can view any salary', () => {
    const result = policy.decide(ctx('secretary'), targetEmployeeId, [companyB]);
    expect(result.canView).toBe(true);
  });

  it('big leader can view salary within company scope', () => {
    const result = policy.decide(ctx('big_leader'), targetEmployeeId, [companyA]);
    expect(result.canView).toBe(true);
  });

  it('big leader denied outside company scope', () => {
    const result = policy.decide(ctx('big_leader'), targetEmployeeId, [companyB]);
    expect(result.canView).toBe(false);
  });

  it('sub leader denied for others', () => {
    const result = policy.decide(ctx('sub_leader'), targetEmployeeId, [companyA]);
    expect(result.canView).toBe(false);
  });

  it('admin manager denied for others by default', () => {
    const result = policy.decide(ctx('admin_manager'), targetEmployeeId, [companyA]);
    expect(result.canView).toBe(false);
  });

  it('admin denied by default', () => {
    const result = policy.decide(ctx('admin'), targetEmployeeId, [companyA]);
    expect(result.canView).toBe(false);
  });

  it('admin allowed with UserPermissionOverride', () => {
    const result = policy.decide(
      ctx('admin', [{ permission: 'salary:read', effect: 'allow' }]),
      targetEmployeeId,
      [companyA],
    );
    expect(result.canView).toBe(true);
  });

  it('admin manager allowed with payroll override', () => {
    const result = policy.decide(
      ctx('admin_manager', [{ permission: 'payroll:read', effect: 'allow' }]),
      targetEmployeeId,
      [companyA],
    );
    expect(result.canView).toBe(true);
  });

  it('always allows viewing own salary', () => {
    const result = policy.decide(
      {
        ...ctx('employee'),
        viewerEmployeeId: targetEmployeeId,
      },
      targetEmployeeId,
      [companyA],
    );
    expect(result.canView).toBe(true);
  });

  it('secretary can view company payroll summary', () => {
    const result = policy.decideCompanyPayrollSummary(ctx('secretary'), companyB);
    expect(result.canView).toBe(true);
  });

  it('admin cannot view company payroll summary without override', () => {
    const result = policy.decideCompanyPayrollSummary(ctx('admin'), companyA);
    expect(result.canView).toBe(false);
  });

  it('unlisted role (no business role) denied for others without override', () => {
    const result = policy.decide(ctx(null), targetEmployeeId, [companyA]);
    expect(result.canView).toBe(false);
    expect(result.reason).toContain('deny-by-default');
  });

  it('unlisted role allowed for others with UserPermissionOverride', () => {
    const result = policy.decide(
      ctx(null, [{ permission: 'salary:read', effect: 'allow' }]),
      targetEmployeeId,
      [companyA],
    );
    expect(result.canView).toBe(true);
  });

  it('sub leader remains denied even with override (matrix self_only, no override path)', () => {
    const result = policy.decide(
      ctx('sub_leader', [{ permission: 'salary:read', effect: 'allow' }]),
      targetEmployeeId,
      [companyA],
    );
    expect(result.canView).toBe(false);
  });
});
