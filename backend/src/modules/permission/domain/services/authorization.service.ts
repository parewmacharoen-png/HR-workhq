// ============================================================================
// modules/permission/domain/services/authorization.service.ts
// Pure decision engine. No I/O. Given a resolved AuthorizationContext and an
// AccessRequest, returns allow/deny following the Phase 1 pipeline:
//   1. RBAC (does the user hold the permission?)
//   2. AI guardrail (AI may never approve/terminate)
//   3. Scope (all / company / team / self)
// Menu-level and feature-flag gates are applied by callers using this result.
// ============================================================================

import {
  AuthorizationContext, AccessRequest, AI_FORBIDDEN_SUFFIXES,
} from '../entities/authorization.types';
import { resolveEffectivePermissions } from './effective-permissions.service';

export interface AuthorizationDecision {
  allowed: boolean;
  reason?: string;
}

export class AuthorizationPolicy {
  decide(ctx: AuthorizationContext, req: AccessRequest): AuthorizationDecision {
    // 2. AI guardrail (checked early; overrides any granted permission)
    if (ctx.userType === 'ai' && AI_FORBIDDEN_SUFFIXES.some((s) => req.permission.endsWith(s))) {
      return { allowed: false, reason: 'AI identities cannot approve or terminate' };
    }

    // 1. Business role bundle + user overrides
    const hasAllScope = ctx.scopes.some((g) => g.scopeType === 'all');
    const effective = resolveEffectivePermissions(ctx);
    if (!hasAllScope && !effective.has(req.permission)) {
      return { allowed: false, reason: `missing permission ${req.permission}` };
    }

    // 3. Scope — user passes if ANY of their grants satisfies the request
    const inScope = ctx.scopes.some((g) => this.scopeSatisfies(g, req, ctx.userId, ctx.employeeId));
    if (!inScope) {
      return { allowed: false, reason: 'out of scope' };
    }

    return { allowed: true };
  }

  private scopeSatisfies(
    grant: { scopeType: string; companyId: string | null; teamId: string | null },
    req: AccessRequest,
    userId: string,
    employeeId: string | null,
  ): boolean {
    switch (grant.scopeType) {
      case 'all':
        // Owner-style: spans all companies.
        return true;
      case 'company':
        return !!req.companyId && grant.companyId === req.companyId;
      case 'team':
        // team scope also implies the company the team is in; team match required
        return !!req.teamId && grant.teamId === req.teamId;
      case 'self':
        if (req.subjectEmployeeId && employeeId) {
          return req.subjectEmployeeId === employeeId;
        }
        return !!req.subjectUserId && req.subjectUserId === userId;
      default:
        return false;
    }
  }
}
