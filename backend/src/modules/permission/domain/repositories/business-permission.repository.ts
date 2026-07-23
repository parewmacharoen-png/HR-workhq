// ============================================================================
// modules/permission/domain/repositories/business-permission.repository.ts
// ============================================================================

import { BusinessRoleCode } from '../entities/business-role.types';

export const BUSINESS_PERMISSION_REPOSITORY = Symbol('BUSINESS_PERMISSION_REPOSITORY');

export interface BusinessPermissionRepository {
  assignBusinessRole(input: {
    userId: string;
    role: BusinessRoleCode;
    actorUserId: string;
  }): Promise<void>;

  replaceScopes(input: {
    userId: string;
    scopes: Array<{
      scopeType: 'all' | 'company' | 'team' | 'self';
      companyId?: string | null;
      teamId?: string | null;
    }>;
    actorUserId: string;
  }): Promise<void>;

  addOverride(input: {
    userId: string;
    permission: string;
    effect: 'allow' | 'deny';
    reason?: string | null;
    actorUserId: string;
  }): Promise<{ id: string }>;

  removeOverride(overrideId: string, actorUserId: string): Promise<void>;

  recordAudit(input: {
    actorId: string;
    targetUserId: string;
    action: string;
    oldValue?: unknown;
    newValue?: unknown;
    reason?: string | null;
  }): Promise<void>;

  listAudit(targetUserId: string, limit?: number): Promise<Array<{
    id: string;
    actorId: string;
    targetUserId: string;
    action: string;
    oldValue: unknown;
    newValue: unknown;
    reason: string | null;
    createdAt: Date;
  }>>;

  findUserAccess(userId: string): Promise<{
    userId: string;
    username: string;
    employeeId: string | null;
    businessRole: BusinessRoleCode | null;
    scopes: Array<{
      id: string;
      scopeType: string;
      companyId: string | null;
      teamId: string | null;
    }>;
    overrides: Array<{
      id: string;
      permission: string;
      effect: 'allow' | 'deny';
      reason: string | null;
      createdAt: Date;
    }>;
  } | null>;

  searchUsers(query: string, limit?: number): Promise<Array<{
    id: string;
    username: string;
    employeeId: string | null;
    displayName: string | null;
  }>>;

  getEmployeeCompanyIds(employeeId: string): Promise<string[]>;

  countActiveOwners(excludeUserId?: string): Promise<number>;

  findUserIdByEmployeeId(employeeId: string): Promise<string | null>;

  getActiveBusinessRole(userId: string): Promise<BusinessRoleCode | null>;

  resolveCompanyNames(ids: string[]): Promise<Array<{ id: string; name: string; code: string }>>;

  resolveTeamNames(ids: string[]): Promise<Array<{ id: string; name: string; companyId: string }>>;
}
