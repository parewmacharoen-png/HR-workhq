// ============================================================================
// access-control-validation.service.unit.spec.ts
// ============================================================================

import { AccessControlValidationService } from './access-control-validation.service';
import { AccessControlValidationError } from '../errors/access-control.errors';

describe('AccessControlValidationService', () => {
  const svc = new AccessControlValidationService();

  it('requires company scope for big leader', () => {
    expect(() => svc.validateRoleAssignment({
      role: 'big_leader',
      companyScopeIds: [],
      teamScopeIds: [],
    })).toThrow(AccessControlValidationError);
  });

  it('allows demoting owner when another owner exists', () => {
    expect(() => svc.assertCanChangeFromOwner('owner', 'admin', 1)).not.toThrow();
  });

  it('blocks demoting the last owner', () => {
    expect(() => svc.assertCanChangeFromOwner('owner', 'admin', 0)).toThrow(AccessControlValidationError);
  });

  it('blocks salary override for employee', () => {
    expect(() => svc.validateOverride('employee', 'salary:read', 'allow')).toThrow(AccessControlValidationError);
  });

  it('owner can assign owner role', () => {
    expect(() => svc.assertActorCanAssignBusinessRole('owner', 'employee', 'owner')).not.toThrow();
  });

  it('secretary cannot assign owner', () => {
    expect(() => svc.assertActorCanAssignBusinessRole('secretary', 'employee', 'owner')).toThrow(
      AccessControlValidationError,
    );
  });

  it('employee cannot assign roles', () => {
    expect(() => svc.assertActorCanAssignBusinessRole('employee', 'employee', 'admin')).toThrow(
      AccessControlValidationError,
    );
  });
});
