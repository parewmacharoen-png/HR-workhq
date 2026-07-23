// ============================================================================
// modules/permission/domain/entities/authorization.types.ts
// Core value types for the layered authorization pipeline:
//   RBAC -> Scope -> Menu -> Impersonation -> Feature flag
// ============================================================================

export type ScopeType = 'all' | 'company' | 'team' | 'self';

export interface ScopeGrant {
  scopeType: ScopeType;
  companyId: string | null;
  teamId: string | null;
}

export interface PermissionOverrideRow {
  permission: string;
  effect: 'allow' | 'deny';
}

/** The fully-resolved authorization picture for one user. */
export interface AuthorizationContext {
  userId: string;
  employeeId: string | null;
  userType: 'human' | 'system' | 'ai';
  businessRole: string | null;
  roleCodes: string[];
  permissions: Set<string>;
  overrides: PermissionOverrideRow[];
  scopes: ScopeGrant[];
}

/** What a guarded action is asking for. */
export interface AccessRequest {
  permission: string;
  /** The company the target record belongs to, if applicable. */
  companyId?: string | null;
  /** The team the target record belongs to, if applicable. */
  teamId?: string | null;
  /** The employee/user the record is about (for 'self' scope checks). */
  subjectUserId?: string | null;
  /** Employee id for self-scope when acting on employee records. */
  subjectEmployeeId?: string | null;
}

// AI identities can never approve or terminate, regardless of granted perms.
export const AI_FORBIDDEN_SUFFIXES = [':approve', ':terminate'];
