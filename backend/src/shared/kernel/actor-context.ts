// ============================================================================
// shared/kernel/actor-context.ts
// Carries the acting user (and impersonator) through command handlers so that
// created_by / updated_by / deleted_by and audit logs are always populated.
// ============================================================================

export interface ActorContext {
  /** The effective user performing the action (may be impersonated). */
  userId: string;
  /** Set when an Owner/Audit is impersonating; null otherwise. */
  impersonatorUserId: string | null;
  /** Company scope in effect for this request, if any. */
  companyId: string | null;
}

/** Convenience for system/background jobs that act without a human user. */
export const SYSTEM_ACTOR: ActorContext = {
  userId: '00000000-0000-0000-0000-000000000000',
  impersonatorUserId: null,
  companyId: null,
};
