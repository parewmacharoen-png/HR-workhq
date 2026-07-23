// ============================================================================
// Unit tests — effective permission resolution (HR-12).
// ============================================================================

import { resolveEffectivePermissions } from './effective-permissions.service';
import { AuthorizationContext } from '../entities/authorization.types';

describe('resolveEffectivePermissions', () => {
  const baseCtx: AuthorizationContext = {
    userId: 'u1',
    employeeId: 'e1',
    userType: 'human',
    businessRole: 'admin',
    roleCodes: ['admin'],
    permissions: new Set(['employee:read', 'payroll:read']),
    overrides: [],
    scopes: [{ scopeType: 'self', companyId: null, teamId: null }],
  };

  it('returns role bundle permissions unchanged', () => {
    const effective = resolveEffectivePermissions(baseCtx);
    expect(effective.has('employee:read')).toBe(true);
    expect(effective.has('payroll:read')).toBe(true);
  });

  it('applies allow override', () => {
    const effective = resolveEffectivePermissions({
      ...baseCtx,
      overrides: [{ permission: 'salary:read', effect: 'allow' }],
    });
    expect(effective.has('salary:read')).toBe(true);
  });

  it('applies deny override', () => {
    const effective = resolveEffectivePermissions({
      ...baseCtx,
      overrides: [{ permission: 'employee:read', effect: 'deny' }],
    });
    expect(effective.has('employee:read')).toBe(false);
  });
});
