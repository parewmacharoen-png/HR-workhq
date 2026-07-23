// ============================================================================
// modules/permission/domain/repositories/permission.repository.ts
// ============================================================================

import { AuthorizationContext } from '../entities/authorization.types';

export const AUTH_CONTEXT_REPOSITORY = Symbol('AUTH_CONTEXT_REPOSITORY');
export const ROLE_ASSIGNMENT_REPOSITORY = Symbol('ROLE_ASSIGNMENT_REPOSITORY');
export const IMPERSONATION_REPOSITORY = Symbol('IMPERSONATION_REPOSITORY');

export interface AuthContextRepository {
  /** Builds the resolved permission/scope picture for a user (joins roles,
   *  role_permissions, scope_grants). Returns null if user not found. */
  loadForUser(userId: string): Promise<AuthorizationContext | null>;
}

export interface RoleAssignmentRepository {
  userHasRole(userId: string, roleId: string): Promise<boolean>;
  assignRole(userId: string, roleId: string, actorUserId: string): Promise<void>;
  revokeRole(userId: string, roleId: string, actorUserId: string): Promise<void>;
  grantScope(input: {
    userId: string;
    scopeType: 'all' | 'company' | 'team' | 'self';
    companyId?: string | null;
    teamId?: string | null;
    actorUserId: string;
  }): Promise<void>;
}

export interface ImpersonationRepository {
  start(actorUserId: string, targetUserId: string, reason: string | null): Promise<string>;
  end(impersonationId: string): Promise<void>;
}
