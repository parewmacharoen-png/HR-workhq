// ============================================================================
// test/helpers/role.fixtures.ts
// TEST-001c — business role fixtures for access matrix
// ============================================================================

import { BUSINESS_ROLE_CODES } from '../../src/modules/permission/domain/entities/business-role.types';

export type MatrixRoleCode = typeof BUSINESS_ROLE_CODES[number];

export const ROLE_FIXTURES: Record<
  'employee' | 'sub_leader' | 'big_leader' | 'secretary' | 'owner',
  { roleCode: MatrixRoleCode; label: string }
> = {
  employee: { roleCode: 'employee', label: 'Employee' },
  sub_leader: { roleCode: 'sub_leader', label: 'Sub Leader' },
  big_leader: { roleCode: 'big_leader', label: 'Big Leader' },
  secretary: { roleCode: 'secretary', label: 'Secretary' },
  owner: { roleCode: 'owner', label: 'Owner' },
};

export const MATRIX_ROLE_CODES = Object.values(ROLE_FIXTURES).map((r) => r.roleCode);
