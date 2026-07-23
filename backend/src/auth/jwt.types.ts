// ============================================================================
// auth/jwt.types.ts
// Shape of the signed access token. impersonatorUserId is present only while an
// Owner/Audit is impersonating; sub is always the EFFECTIVE user.
// ============================================================================

export interface JwtPayload {
  /** Effective user id (the impersonated user when impersonating). */
  sub: string;
  username: string;
  userType: 'human' | 'system' | 'ai';
  /** Real actor when impersonating; null/absent otherwise. */
  impersonatorUserId?: string | null;
  /** Active company scope, if the session is company-scoped. */
  companyId?: string | null;
  iat?: number;
  exp?: number;
}

/** The object attached to request.user after successful auth. */
export interface AuthenticatedUser {
  id: string;
  username: string;
  userType: 'human' | 'system' | 'ai';
  impersonatorUserId: string | null;
  companyId: string | null;
  mustChangePassword: boolean;
}
